import { describe, expect, it } from "vitest";
import {
  ComponentRouter,
  createComponentSigner,
  type ComponentInteractionLike,
  type ComponentSigner,
  type ModerationActions,
  type ModerationActionResult,
  type ModuleSettings,
  type ReplyInput,
} from "@keystone/kernel";
import {
  APPEAL_PANEL_TTL_MS,
  TIMELINE_PANEL_TTL_MS,
  VERIFY_PANEL_TTL_MS,
  CaseService,
  InMemoryCaseStore,
  InMemoryMemberStore,
  appealCustomId,
  moderationSettingsSchema,
  timelineRefreshCustomId,
  verifyCustomId,
  type MemberTimeline,
} from "@keystone/module-moderation";
import {
  registerModerationRoutes,
  type MemberTimelineLoader,
  type ModerationButtonDeps,
} from "./moderation-buttons";

const NOW = 1_800_000_000_000;
const SECRET = "moderation-test-secret";
const signer = createComponentSigner(SECRET);
const GUILD = "guild-1";
const MEMBER = "1450130465146142799";
const OTHER_MEMBER = "1450130465146142800";

function settings(values: Record<string, unknown>): ModuleSettings {
  const parsed = moderationSettingsSchema.parse(values) as unknown as Record<string, unknown>;
  return {
    async get() {
      return parsed;
    },
    async update() {
      throw new Error("button handlers must never write settings");
    },
  };
}

function actions(): { calls: string[]; port: ModerationActions } {
  const calls: string[] = [];
  const ok = async (): Promise<ModerationActionResult> => ({ ok: true });
  return {
    calls,
    port: {
      ban: ok,
      unban: ok,
      addRole: ok,
      removeRole: ok,
      lockdown: ok,
      restoreLockdown: ok,
      kick: ok,
      timeout: ok,
      purge: ok,
      lock: ok,
      slowmode: ok,
      deleteMessage: ok,
      deleteWebhook: ok,
      quarantine: ok,
      async unquarantine(guildId, userId, reason) {
        calls.push(`${guildId}:${userId}:${reason}`);
        return { ok: true };
      },
      async notify() {
        /* buttons do not notify */
      },
      directMessage: ok,
    },
  };
}

async function fixture(
  options: {
    readonly caseTarget?: string;
    readonly appealsEnabled?: boolean;
    readonly joinGate?: boolean;
  } = {},
): Promise<{
  record: Awaited<ReturnType<InMemoryCaseStore["create"]>>;
  store: InMemoryCaseStore;
  members: InMemoryMemberStore;
  actionCalls: string[];
  router: ComponentRouter;
}> {
  const store = new InMemoryCaseStore();
  const cases = new CaseService(store);
  const record = await store.create({
    guildId: "guild-1",
    caseNumber: await store.nextCaseNumber("guild-1"),
    actorId: "moderator-1",
    targetId: options.caseTarget ?? "user-1",
    action: "warn",
    reason: "spam",
    state: "open",
  });
  const members = new InMemoryMemberStore();
  await members.markQuarantined("guild-1", "user-1");
  const { calls, port } = actions();

  const deps: ModerationButtonDeps = {
    settings: settings({
      appealsEnabled: options.appealsEnabled ?? true,
      joinGate: { enabled: options.joinGate ?? true },
    }),
    moderation: { cases, actions: port, members },
  };
  return { record, store, members, actionCalls: calls, router: registerModerationRoutes(new ComponentRouter(), deps) };
}

class FakeButton implements ComponentInteractionLike {
  readonly kind = "button" as const;
  readonly channelId = "chan-1";
  readonly permissions: readonly string[] = [];
  readonly replies: ReplyInput[] = [];
  #replied = false;

  constructor(
    readonly customId: string,
    readonly guildId: string | null = "guild-1",
    readonly userId = "user-1",
  ) {}

  get replied(): boolean {
    return this.#replied;
  }

  async reply(input: ReplyInput): Promise<unknown> {
    this.#replied = true;
    this.replies.push(input);
    return undefined;
  }
}

describe("signed moderation buttons", () => {
  it("opens an appeal from a signed case panel and writes the event", async () => {
    const { record, store, router } = await fixture();
    const button = new FakeButton(appealCustomId(record.id, signer, NOW));

    expect(await router.dispatch(button, signer, NOW)).toBe(true);

    expect(button.replies).toEqual([
      {
        content: "Appeal opened for case #1. A moderator can review it with /mod review.",
        ephemeral: true,
      },
    ]);
    expect((await store.getById(record.id))?.state).toBe("appealed");
    expect((await store.listEvents(record.id)).map((event) => event.type)).toEqual(["appealed"]);
  });

  it("refuses an appeal when the operator disabled appeals", async () => {
    const { record, store, router } = await fixture({ appealsEnabled: false });
    const button = new FakeButton(appealCustomId(record.id, signer, NOW));

    await router.dispatch(button, signer, NOW);

    expect(button.replies).toEqual([
      { content: "Appeals are disabled in this server.", ephemeral: true },
    ]);
    expect((await store.getById(record.id))?.state).toBe("open");
    expect(await store.listEvents(record.id)).toEqual([]);
  });

  it("refuses an appeal from a member the case is not against", async () => {
    const { record, store, router } = await fixture({ caseTarget: "someone-else" });
    const button = new FakeButton(appealCustomId(record.id, signer, NOW));

    await router.dispatch(button, signer, NOW);

    expect(button.replies).toEqual([
      { content: "You can only appeal a case against you.", ephemeral: true },
    ]);
    expect((await store.getById(record.id))?.state).toBe("open");
  });

  it("refuses a case panel clicked in another guild", async () => {
    const { record, store, router } = await fixture();
    const button = new FakeButton(appealCustomId(record.id, signer, NOW), "guild-2");

    await router.dispatch(button, signer, NOW);

    expect(button.replies).toEqual([{ content: "That case does not exist.", ephemeral: true }]);
    expect((await store.getById(record.id))?.state).toBe("open");
    expect(await store.listEvents(record.id)).toEqual([]);
  });

  it("refuses an expired id before any store read", async () => {
    const { record, store, router } = await fixture();
    const button = new FakeButton(appealCustomId(record.id, signer, NOW));

    await router.dispatch(button, signer, NOW + APPEAL_PANEL_TTL_MS + 1_000);

    expect(button.replies[0]?.content).toMatch(/expired/);
    expect((await store.getById(record.id))?.state).toBe("open");
  });

  it("refuses a forged id with no write", async () => {
    const { record, store, router } = await fixture();
    const forged = appealCustomId(record.id, signer, NOW).replace(record.id, "someone-elses-case");
    const button = new FakeButton(forged);

    await router.dispatch(button, signer, NOW);

    expect(button.replies[0]?.content).toMatch(/expired/);
    expect(await store.listEvents(record.id)).toEqual([]);
  });

  it("leaves a legacy unsigned appeal id unhandled", async () => {
    const { record, store, router } = await fixture();
    const button = new FakeButton(`keystone:appeal:${record.id}`);

    expect(await router.dispatch(button, signer, NOW)).toBe(false);
    expect(button.replies).toEqual([]);
    expect(await store.listEvents(record.id)).toEqual([]);
  });

  it("verifies a quarantined member from a DM using the guild inside the payload", async () => {
    const { members, actionCalls, router } = await fixture();
    const button = new FakeButton(verifyCustomId("guild-1", "user-1", signer, NOW), null);

    expect(await router.dispatch(button, signer, NOW)).toBe(true);

    expect(button.replies).toEqual([
      { content: "Verified. Quarantine has been lifted.", ephemeral: false },
    ]);
    expect(actionCalls).toEqual(["guild-1:user-1:Verification completed"]);
    expect(await members.get("guild-1", "user-1")).toMatchObject({
      quarantined: false,
      verifiedAt: expect.any(String),
    });
  });

  it("refuses a verify click from another member before any action", async () => {
    const { members, actionCalls, router } = await fixture();
    const button = new FakeButton(verifyCustomId("guild-1", "user-1", signer, NOW), "guild-1", "intruder");

    await router.dispatch(button, signer, NOW);

    expect(button.replies).toEqual([
      { content: "This verification belongs to another member.", ephemeral: true },
    ]);
    expect(actionCalls).toEqual([]);
    expect((await members.get("guild-1", "user-1"))?.quarantined).toBe(true);
  });

  it("refuses a verify id minted for another guild", async () => {
    const { actionCalls, router } = await fixture();
    const button = new FakeButton(verifyCustomId("guild-2", "user-1", signer, NOW), "guild-1");

    await router.dispatch(button, signer, NOW);

    expect(button.replies).toEqual([
      { content: "That panel belongs to another server.", ephemeral: true },
    ]);
    expect(actionCalls).toEqual([]);
  });

  it("refuses an expired verify link and a legacy in-guild verify id", async () => {
    const { members, actionCalls, router } = await fixture();
    const expired = new FakeButton(verifyCustomId("guild-1", "user-1", signer, NOW), null);
    await router.dispatch(expired, signer, NOW + VERIFY_PANEL_TTL_MS + 1_000);
    expect(expired.replies[0]?.content).toMatch(/expired/);

    const legacy = new FakeButton("keystone:verify:user-1");
    expect(await router.dispatch(legacy, signer, NOW)).toBe(false);
    expect(legacy.replies).toEqual([]);

    expect(actionCalls).toEqual([]);
    expect((await members.get("guild-1", "user-1"))?.quarantined).toBe(true);
  });
});

function timeline(userId = MEMBER): MemberTimeline {
  return {
    guildId: GUILD,
    facts: { userId, level: 2, xp: 300, balance: 40 },
    entries: [
      {
        at: "2026-11-05T12:00:00.000Z",
        source: "cases",
        text: "**Case #3** · open — spam",
      },
    ],
    truncated: 0,
    sources: [
      { source: "cases", state: "ok", rows: 1 },
      { source: "case_events", state: "ok", rows: 1 },
      { source: "tickets", state: "ok", rows: 0 },
      { source: "levels", state: "ok", rows: 1 },
      { source: "economy_ledger", state: "ok", rows: 1 },
      { source: "invite_joins", state: "ok", rows: 0 },
      { source: "form_submissions", state: "ok", rows: 0 },
      { source: "event_rsvps", state: "ok", rows: 0 },
      { source: "modmail_threads", state: "ok", rows: 0 },
      { source: "members", state: "ok", rows: 0 },
    ],
  };
}

/**
 * The refresh route needs a staff member with `ModerateMembers`, because the
 * panel is a cross-module history of another person. It shares the signed
 * router with the appeal and verify suites, so a regression in one route's
 * signature handling shows up in the same run.
 */
class FakeRefreshButton implements ComponentInteractionLike {
  readonly kind = "button" as const;
  readonly channelId = "chan-1";
  readonly replies: ReplyInput[] = [];
  readonly updates: ReplyInput[] = [];
  #replied = false;

  constructor(
    readonly customId: string,
    readonly guildId: string | null = GUILD,
    readonly userId = "staff-1",
    readonly permissions: readonly string[] = ["ModerateMembers"],
  ) {}

  get replied(): boolean {
    return this.#replied;
  }

  async reply(input: ReplyInput): Promise<unknown> {
    this.#replied = true;
    this.replies.push(input);
    return undefined;
  }

  async update(input: ReplyInput): Promise<unknown> {
    this.updates.push(input);
    return undefined;
  }
}

interface LoadCalls {
  readonly guildId: string;
  readonly userId: string;
}

function timelineFixture(overrides: Partial<ModerationButtonDeps> = {}): {
  router: ComponentRouter;
  signer: ComponentSigner;
  calls: LoadCalls[];
} {
  const signer = createComponentSigner("timeline-route-test");
  const calls: LoadCalls[] = [];
  const load: MemberTimelineLoader = async (guildId, userId) => {
    calls.push({ guildId, userId });
    return timeline(userId);
  };
  const router = new ComponentRouter();
  registerModerationRoutes(router, {
    settings: settings({}),
    moderation: {
      cases: new CaseService(new InMemoryCaseStore()),
      actions: actions().port,
      members: new InMemoryMemberStore(),
    },
    signer,
    timeline: load,
    ...overrides,
  });
  return { router, signer, calls };
}

describe("timeline refresh route", () => {
  it("re-reads the same guild and member and edits the panel in place", async () => {
    const { router, signer, calls } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW));

    const handled = await router.dispatch(button, signer, NOW);

    expect(handled).toBe(true);
    expect(calls).toEqual([{ guildId: GUILD, userId: MEMBER }]);
    expect(button.replies).toHaveLength(0);
    expect(button.updates).toHaveLength(1);
    const v2 = JSON.stringify(button.updates[0]?.v2);
    expect(v2).toContain("Member timeline");
    expect(v2).toContain(`<@${MEMBER}>`);
    expect(v2).toContain("`cases`");
    expect(v2).toContain("Read <t:");
    expect(v2).toContain("↻ Refresh");
  });

  it("re-signs the refresh id so the edited panel still works", async () => {
    const { router, signer } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW));

    await router.dispatch(button, signer, NOW + 60_000);

    const sent = JSON.stringify(button.updates[0]?.v2) as string;
    const id = sent.match(/k1:[^"]+timeline:refresh:\d+/)?.[0];
    expect(id).toBeDefined();
    const parsed = signer.parse(id!, NOW + 60_000);
    expect(parsed).toMatchObject({ ok: true, namespace: "timeline", action: "refresh", payload: MEMBER });
    if (parsed.ok) {
      expect(parsed.expiresAt).toBeGreaterThan(NOW + TIMELINE_PANEL_TTL_MS - 1_000);
    }
  });

  it("refuses a click without ModerateMembers before reading anything", async () => {
    const { router, signer, calls } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW), GUILD, "staff-1", []);

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(button.updates).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/permission/i);
  });

  it("refuses an expired id", async () => {
    const { router, signer, calls } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW));

    expect(await router.dispatch(button, signer, NOW + TIMELINE_PANEL_TTL_MS + 1_000)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/expired/i);
  });

  it("refuses a forged id", async () => {
    const { router, signer, calls } = timelineFixture();
    const valid = timelineRefreshCustomId(MEMBER, signer, NOW);
    const forged = valid.replace(/k1:([^:]+)/, `k1:${"a".repeat(16)}`);
    const button = new FakeRefreshButton(forged);

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/expired|fresh/i);
  });

  it("refuses a signed id whose payload is not a member id", async () => {
    const { router, signer, calls } = timelineFixture();
    const button = new FakeRefreshButton(
      signer.sign(
        { namespace: "timeline", action: "refresh", payload: "not-a-member", ttlMs: 60_000 },
        NOW,
      ),
    );

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/not valid/i);
  });

  it("is guild-only", async () => {
    const { router, signer, calls } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW), null);

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/server/i);
  });

  it("turns a failing store into a retry message instead of an unacknowledged click", async () => {
    const { router, signer } = timelineFixture({
      timeline: async () => {
        throw new Error("database down");
      },
    });
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW));

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(button.updates).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/try again/i);
  });

  it("refuses refresh when the bot was composed without a loader", async () => {
    const { router, signer } = timelineFixture({ timeline: undefined });
    const button = new FakeRefreshButton(timelineRefreshCustomId(MEMBER, signer, NOW));

    expect(await router.dispatch(button, signer, NOW)).toBe(true);
    expect(button.updates).toHaveLength(0);
    expect(button.replies[0]?.content).toMatch(/cannot re-read/i);
  });

  it("scopes the status line to the member the loader returned, not the payload", async () => {
    const { router, signer } = timelineFixture();
    const button = new FakeRefreshButton(timelineRefreshCustomId(OTHER_MEMBER, signer, NOW));

    await router.dispatch(button, signer, NOW);

    expect(JSON.stringify(button.updates[0]?.v2)).toContain(`<@${OTHER_MEMBER}>`);
  });
});
