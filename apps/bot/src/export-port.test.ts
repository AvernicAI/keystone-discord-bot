import { afterEach, describe, expect, it } from "vitest";
import type { ConfigPort } from "@keystone/kernel";
import { parseBundle, type ExportBundle } from "@keystone/importer";
import { createPortabilityStore } from "@keystone/db";
import { createMigratedPglite, type PgliteHarness } from "@keystone/db/testing";
import { InMemoryAiStore } from "@keystone/module-ai";
import { InMemoryCommunityStore } from "@keystone/module-community";
import { InMemoryCaseStore } from "@keystone/module-moderation";
import { createMemoryExportPort, createSqlExportPort } from "./export-port";

const GUILD = "999999999999999999";
const USER_A = "111111111111111111";
const USER_B = "222222222222222222";
const FIXED = () => Date.parse("2026-11-01T12:00:00.000Z");

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function sqlPort() {
  harness = await createMigratedPglite();
  const store = createPortabilityStore(harness as never);
  return { store, port: createSqlExportPort(store, FIXED) };
}

async function seedSql(_store: ReturnType<typeof createPortabilityStore>): Promise<void> {
  const runner = harness?.runner;
  if (!runner) throw new Error("harness missing");
  await runner.exec(
    `insert into guilds (id, name, locale, plan) values ('${GUILD}', 'Export Test', 'en', 'free')`,
  );
  await runner.exec(
    `insert into settings (guild_id, module, key, value) values ('${GUILD}', 'logging', 'channelId', '"404"')`,
  );
  await runner.exec(
    `insert into cases (guild_id, case_number, actor_id, target_id, action, reason, rule, state) values ('${GUILD}', 1, 'system', '${USER_A}', 'ban', 'raid', null, 'open'), ('${GUILD}', 2, '${USER_B}', '${USER_B}', 'kick', 'spam', null, 'open')`,
  );
  await runner.exec(
    `insert into tickets (guild_id, channel_id, opener_id, subject, state) values ('${GUILD}', '555555555555555555', '${USER_A}', 'Help', 'open')`,
  );
  await runner.exec(
    `insert into levels (guild_id, user_id, xp, level) values ('${GUILD}', '${USER_A}', 1250, 12), ('${GUILD}', '${USER_B}', 300, 3)`,
  );
  await runner.exec(
    `insert into xp_events (guild_id, user_id, amount, source, idempotency_key) values ('${GUILD}', '${USER_A}', 25, 'message', 'xp:${GUILD}:m1')`,
  );
  await runner.exec(
    `insert into economy_ledger (guild_id, user_id, amount, reason, idempotency_key) values ('${GUILD}', '${USER_A}', 100, 'daily', 'daily:${GUILD}:${USER_A}')`,
  );
  await runner.exec(
    `insert into community_records (guild_id, kind, key, data) values ('${GUILD}', 'tag', 'rules', '{"content":"Be kind"}')`,
  );
  await runner.exec(
    `insert into ai_documents (guild_id, name, content, chunks) values ('${GUILD}', 'rules.md', 'Be kind.', '[{"text":"Be kind.","embedding":[0.1,0.2]}]')`,
  );
  await runner.exec(
    `insert into ai_usage (guild_id, period, requests, input_tokens, output_tokens, cost_micros) values ('${GUILD}', '2026-11', 2, 10, 5, 7)`,
  );
  await runner.exec(`insert into case_counters (guild_id, next_case_number) values ('${GUILD}', 3)`);
}

function parse(result: { content: string }): ExportBundle {
  return parseBundle(result.content);
}

describe("SQL export port", () => {
  it("exports every seeded row and reports the same checksum the manifest carries", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);

    const result = await port.guild(GUILD);
    const bundle = parse(result);

    expect(result.checksum).toBe(bundle.manifest.checksum);
    expect(bundle.manifest.counts).toMatchObject({
      settings: 1,
      cases: 2,
      caseEvents: 0,
      tickets: 1,
      levels: 2,
      xpEvents: 1,
      economyLedger: 1,
      communityRecords: 1,
      aiDocuments: 1,
      aiUsage: 1,
    });
    expect(bundle.snapshot.cases.find((row) => row.caseNumber === 1)?.reason).toBe("raid");
    expect(bundle.snapshot.levels.find((row) => row.userId === USER_A)?.xp).toBe(1250);
  });

  it("filters a user export to that member's rows only", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);

    const result = await port.user(GUILD, USER_A);
    const payload = JSON.parse(result.content) as {
      counts: Record<string, number>;
      rows: { cases: Array<{ caseNumber: number }>; levels: Array<{ userId: string }> };
    };

    expect(result.counts.cases).toBe(1);
    expect(result.counts.levels).toBe(1);
    expect(payload.rows.cases.map((row) => row.caseNumber)).toEqual([1]);
    expect(payload.rows.levels.map((row) => row.userId)).toEqual([USER_A]);
    expect(result.content).not.toContain(USER_B);
  });

  it("previews, applies and verifies the same bundle it exported", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);
    const original = await port.guild(GUILD);

    const preview = await port.importBundle(GUILD, original.content, {
      mode: "replace",
      dryRun: true,
      actorId: "tester",
    });
    expect(preview.state).toBe("dry-run");
    expect(preview.verified).toBeUndefined();

    const applied = await port.importBundle(GUILD, original.content, {
      mode: "replace",
      dryRun: false,
      actorId: "tester",
    });
    expect(applied.state).toBe("applied");
    expect(applied.verified).toBe(true);
    expect(applied.importId).toBeTruthy();
    expect(applied.checksum).toBe(original.checksum);

    const after = await port.guild(GUILD);
    expect(after.checksum).toBe(original.checksum);
  });

  it("rolls an applied import back to its pre-import snapshot", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);
    const original = await port.guild(GUILD);

    await harness?.runner.exec(
      `update settings set value = '"999"' where guild_id = '${GUILD}' and module = 'logging' and key = 'channelId'`,
    );
    const applied = await port.importBundle(GUILD, original.content, {
      mode: "replace",
      dryRun: false,
    });
    expect(applied.state).toBe("applied");

    await harness?.runner.exec(
      `update settings set value = '"777"' where guild_id = '${GUILD}' and module = 'logging' and key = 'channelId'`,
    );
    const rolled = await port.rollback(applied.importId as string);
    expect(rolled.state).toBe("rolled-back");
    expect((await store.snapshot(GUILD)).settings[0]?.value).toBe("999");
  });

  it("deletes the guild, writes a receipt and then refuses a missing rollback", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);

    const deleted = await port.deleteGuild(GUILD, "tester");
    expect(deleted.counts.cases).toBe(2);
    expect(deleted.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect((await store.snapshot(GUILD)).cases).toEqual([]);

    await expect(port.rollback(deleted.importId)).rejects.toThrow(/only an applied import/i);
  });

  it("reports a missing channel from the stored id and never writes a fix", async () => {
    const { store, port } = await sqlPort();
    await seedSql(store);

    const report = await port.drift(GUILD, {
      channels: [],
      roles: [],
      categories: [],
      automodRules: [],
    });

    expect(report.refs).toBe(1);
    expect(report.missing[0]).toMatchObject({
      kind: "channel",
      id: "404",
      path: "logging.channelId",
    });
    expect(report.readOnly).toBe(true);
    expect((await store.snapshot(GUILD)).settings[0]?.value).toBe("404");
  });
});

function memoryConfig(settings: Record<string, unknown>): ConfigPort {
  return {
    async list() {
      return [{ id: "logging", name: "Logging", settings }];
    },
    async update() {
      throw new Error("export must never write settings");
    },
    async reset() {
      throw new Error("export must never reset settings");
    },
  };
}

async function memoryPort() {
  const cases = new InMemoryCaseStore();
  const caseRecord = await cases.create({
    guildId: GUILD,
    caseNumber: await cases.nextCaseNumber(GUILD),
    actorId: "system",
    targetId: USER_A,
    action: "ban",
    reason: "raid",
    state: "open",
  });
  await cases.appendEvent(caseRecord.id, "created", "system", { reason: "raid" });
  const community = new InMemoryCommunityStore();
  await community.awardXp({
    guildId: GUILD,
    userId: USER_A,
    amount: 25,
    source: "message",
    idempotencyKey: "xp:memory:1",
  });
  await community.addLedger({
    guildId: GUILD,
    userId: USER_A,
    amount: 100,
    reason: "daily",
    idempotencyKey: "daily:memory:1",
  });
  await community.createTicket({
    guildId: GUILD,
    channelId: "555555555555555555",
    openerId: USER_A,
    subject: "Help",
  });
  await community.putRecord(GUILD, "tag", "rules", { content: "Be kind" });
  const ai = new InMemoryAiStore();
  await ai.addDocument({
    guildId: GUILD,
    name: "rules.md",
    content: "Be kind.",
    chunks: [{ text: "Be kind.", embedding: [0.1, 0.2] }],
  });
  await ai.addUsage({
    guildId: GUILD,
    period: "2026-11",
    requests: 2,
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.000007,
  });

  return {
    cases,
    community,
    ai,
    port: createMemoryExportPort({
      config: memoryConfig({ channelId: "404" }),
      cases,
      community,
      ai,
      now: FIXED,
    }),
  };
}

describe("memory export port", () => {
  it("exports the rows the live in-memory stores actually hold", async () => {
    const { port } = await memoryPort();
    const result = await port.guild(GUILD);
    const bundle = parse(result);

    expect(bundle.manifest.counts).toMatchObject({
      settings: 1,
      cases: 1,
      caseEvents: 1,
      tickets: 1,
      levels: 1,
      xpEvents: 1,
      economyLedger: 1,
      communityRecords: 1,
      aiDocuments: 1,
      aiUsage: 1,
      members: 0,
      auditEvents: 0,
    });
    expect(result.warnings.join(" ")).toContain("Member profiles and audit events");
    expect(bundle.snapshot.communityRecords[0]?.data).toEqual({ content: "Be kind" });
  });

  it("filters the same live snapshot for a user and names the missing backing stores", async () => {
    const { port } = await memoryPort();
    const result = await port.user(GUILD, USER_A);
    expect(result.counts).toMatchObject({
      cases: 1,
      caseEvents: 1,
      tickets: 1,
      levels: 1,
      xpEvents: 1,
      economyLedger: 1,
    });
    expect(result.warnings.join(" ")).toContain("private");
  });

  it("refuses destructive actions instead of pretending a transaction exists", async () => {
    const { port } = await memoryPort();
    await expect(port.importBundle(GUILD, "{}", { mode: "replace", dryRun: true })).rejects.toThrow(
      /needs DATABASE_URL/,
    );
    await expect(port.deleteGuild(GUILD, "actor")).rejects.toThrow(/needs DATABASE_URL/);
    await expect(port.rollback("import-1")).rejects.toThrow(/needs DATABASE_URL/);
  });

  it("still produces a real drift report from effective settings and live facts", async () => {
    const { port } = await memoryPort();
    const report = await port.drift(GUILD, {
      channels: [],
      roles: [],
      categories: [],
      automodRules: [],
    });
    expect(report.missing[0]?.path).toBe("logging.channelId");
    expect(report.readOnly).toBe(true);
  });
});
