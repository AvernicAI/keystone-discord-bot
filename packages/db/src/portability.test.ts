import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  PortabilityService,
  checksumSnapshot,
  createBundle,
  parseBundle,
  serializeBundle,
  type GuildSnapshot,
} from "@keystone/importer";
import {
  aiDocuments,
  aiUsage,
  caseCounters,
  caseEvents,
  cases,
  communityRecords,
  createPortabilityStore,
  economyLedger,
  guilds,
  levels,
  settings,
  tickets,
  xpEvents,
} from "./index";
import { createMigratedPglite, type PgliteHarness } from "./testing";

const GUILD = "999999999999999999";
const USER_A = "111111111111111111";
const USER_B = "222222222222222222";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function seed(): Promise<{ harness: PgliteHarness; store: ReturnType<typeof createPortabilityStore> }> {
  harness = await createMigratedPglite();
  const store = createPortabilityStore(harness as never);
  const db = harness.db;

  await db.insert(guilds).values({ id: GUILD, name: "Portability Test", locale: "en", plan: "free" });
  await db.insert(settings).values([
    { guildId: GUILD, module: "moderation", key: "dryRun", value: true },
    { guildId: GUILD, module: "moderation", key: "modLogChannelId", value: "333333333333333333" },
    { guildId: GUILD, module: "community", key: "welcome", value: { enabled: true, channelId: "444444444444444444" } },
  ]);
  const [record] = await db
    .insert(cases)
    .values({
      guildId: GUILD,
      caseNumber: 1,
      actorId: "system",
      targetId: USER_A,
      action: "ban",
      reason: "raid",
      rule: "join-gate",
      evidence: { joins: 12, nested: { ok: true } },
    })
    .returning();
  if (!record) throw new Error("seed failed");
  await db.insert(caseEvents).values({ caseId: record.id, type: "created", actorId: "system" });
  await db.insert(tickets).values({
    guildId: GUILD,
    channelId: "555555555555555555",
    openerId: USER_A,
    subject: "Help",
    state: "open",
  });
  await db.insert(levels).values([
    { guildId: GUILD, userId: USER_A, xp: 1250, level: 12 },
    { guildId: GUILD, userId: USER_B, xp: 300, level: 3 },
  ]);
  await db.insert(xpEvents).values({
    guildId: GUILD,
    userId: USER_A,
    amount: 25,
    source: "message",
    idempotencyKey: `xp:${GUILD}:message-1`,
  });
  await db.insert(economyLedger).values({
    guildId: GUILD,
    userId: USER_A,
    amount: 100,
    reason: "daily",
    idempotencyKey: `daily:${GUILD}:${USER_A}:2026-10-31`,
  });
  await db.insert(communityRecords).values({
    guildId: GUILD,
    kind: "tag",
    key: "rules",
    data: { content: "Be kind" },
  });
  await db.insert(aiDocuments).values({
    guildId: GUILD,
    name: "rules.md",
    content: "Be kind.",
    chunks: [{ text: "Be kind.", embedding: [0.1, 0.2] }],
  });
  await db.insert(aiUsage).values({
    guildId: GUILD,
    period: "2026-10",
    requests: 2,
    inputTokens: 10,
    outputTokens: 5,
    costMicros: 7,
  });
  await db.insert(caseCounters).values({ guildId: GUILD, nextCaseNumber: 2 });

  return { harness, store };
}

describe("DrizzlePortabilityStore", () => {
  it("exports, validates, wipes and restores a guild with identical content", async () => {
    const { store } = await seed();
    const service = new PortabilityService(store);

    const bundle = await service.exportGuild(GUILD);
    const parsed = parseBundle(serializeBundle(bundle));
    expect(parsed.manifest.counts.levels).toBe(2);
    expect(parsed.manifest.counts.cases).toBe(1);

    const before = await store.snapshot(GUILD);
    await service.deleteGuild(GUILD, "test");
    expect((await store.snapshot(GUILD)).settings).toHaveLength(0);

    const outcome = await service.importBundle(parsed, GUILD, { mode: "replace", actorId: "test" });
    expect(outcome.state).toBe("applied");
    expect(outcome.receipt.verified).toBe(true);

    const after = await store.snapshot(GUILD);
    expect(checksumSnapshot(after)).toBe(checksumSnapshot(before));
    expect(after.cases[0]?.evidence).toEqual({ joins: 12, nested: { ok: true } });
    expect(after.economyLedger).toHaveLength(1);
  });

  it("round-trips a 5,000-member level table", async () => {
    const { store, harness } = await seed();
    const service = new PortabilityService(store);
    const rows = Array.from({ length: 5_000 }, (_, index) => ({
      guildId: GUILD,
      userId: String(1_000_000_000_000_000 + index),
      xp: index * 10,
      level: Math.floor((index * 10) / 100),
    }));
    for (let index = 0; index < rows.length; index += 500) {
      await harness.db.insert(levels).values(rows.slice(index, index + 500));
    }

    const bundle = await service.exportGuild(GUILD);
    expect(bundle.manifest.counts.levels).toBe(5_002);
    await service.deleteGuild(GUILD, "test");
    const outcome = await service.importBundle(bundle, GUILD, { mode: "replace" });
    expect(outcome.receipt.verified).toBe(true);
    const after = await store.snapshot(GUILD);
    expect(after.levels).toHaveLength(5_002);
    expect(checksumSnapshot(after)).toBe(bundle.manifest.checksum);
  });

  it("leaves the guild intact when a restore fails inside its transaction", async () => {
    const { store } = await seed();
    const service = new PortabilityService(store);
    const bundle = await service.exportGuild(GUILD);
    const broken: GuildSnapshot = {
      ...bundle.snapshot,
      cases: [
        ...bundle.snapshot.cases,
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          caseNumber: 1,
          actorId: "system",
          targetId: USER_B,
          action: "kick",
          reason: "duplicate",
          rule: null,
          state: "open",
          evidence: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    const before = await store.snapshot(GUILD);

    await expect(
      service.importBundle(createBundle(broken), GUILD, { mode: "replace" }),
    ).rejects.toThrow(/rolled back/i);

    const after = await store.snapshot(GUILD);
    expect(checksumSnapshot(after)).toBe(checksumSnapshot(before));
    expect(after.guild.name).toBe("Portability Test");
  });

  it("rolls an applied import back to the pre-import snapshot inside 24 hours", async () => {
    const { store, harness } = await seed();
    const service = new PortabilityService(store, () => Date.parse("2026-10-31T12:00:00.000Z"));
    const original = await service.exportGuild(GUILD);

    await harness.db
      .update(settings)
      .set({ value: false })
      .where(and(eq(settings.guildId, GUILD), eq(settings.key, "dryRun")));

    const imported = await service.importBundle(original, GUILD, { mode: "replace" });
    expect(imported.importId).toBeTruthy();

    const rolled = await service.rollback(imported.importId as string);
    expect(rolled.state).toBe("rolled-back");
    const after = await store.snapshot(GUILD);
    const dryRun = after.settings.find((row) => row.module === "moderation" && row.key === "dryRun");
    expect(dryRun?.value).toBe(false);
  });

  it("imports a MEE6-style level file with keep-higher semantics", async () => {
    const { store } = await seed();
    const service = new PortabilityService(store);
    const imported = {
      source: "mee6",
      warnings: [],
      skipped: 0,
      rows: [
        { userId: USER_A, xp: 900 },
        { userId: USER_B, xp: 4000, sourceLevel: 40 },
      ],
    };
    const outcome = await service.importLevels(imported, GUILD, { mode: "keep-higher" });
    expect(outcome.state).toBe("applied");
    const after = await store.snapshot(GUILD);
    expect(after.levels.find((row) => row.userId === USER_A)?.xp).toBe(1250);
    expect(after.levels.find((row) => row.userId === USER_B)?.xp).toBe(4000);
    expect(after.levels.find((row) => row.userId === USER_B)?.level).toBe(40);
  });

  it("deletes guild data but keeps a receipt with counts, not content", async () => {
    const { store } = await seed();
    const service = new PortabilityService(store);
    const { record, counts } = await service.deleteGuild(GUILD, "admin");

    expect(counts.settings).toBe(3);
    expect(record.state).toBe("deleted");
    expect(record.receipt?.deletedGuild).toBe(GUILD);
    expect((await store.snapshot(GUILD)).settings).toHaveLength(0);

    const kept = await store.getImport(record.id);
    expect(kept?.receipt?.counts?.cases).toBe(1);
    expect(kept?.receipt?.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports drift for missing channels and roles without writing", async () => {
    const { store } = await seed();
    const service = new PortabilityService(store);
    const report = await service.drift(
      GUILD,
      {
        channels: ["444444444444444444"],
        roles: [],
        categories: [],
        automodRules: [],
        channelPermissions: { "444444444444444444": { SendMessages: false } },
      },
      ["keystone-words"],
    );

    expect(report.refs).toBe(2);
    expect(report.missing.map((row) => row.path)).toContain("moderation.modLogChannelId");
    expect(report.permissionGaps[0]?.permission).toBe("SendMessages");
    expect(report.missingAutoModRules).toEqual(["keystone-words"]);
    expect(report.readOnly).toBe(true);
  });
});
