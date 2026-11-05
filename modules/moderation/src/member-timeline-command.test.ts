import { describe, expect, it } from "vitest";
import type {
  CommunityPort,
  CommunityStore,
  EventStore,
  FormStore,
  InvitePort,
  ModmailStore,
  ModerationPort,
} from "@keystone/kernel";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import { mod } from "./commands/mod";
import { CaseService, InMemoryCaseStore } from "./cases";
import { InMemoryMemberStore } from "./members";

function fakeCommunity(): CommunityStore {
  return {
    getLevel: async () => ({
      guildId: "guild-1",
      userId: "target",
      xp: 240,
      level: 2,
      updatedAt: "2026-11-05T10:00:00.000Z",
    }),
    awardXp: async () => {
      throw new Error("not used");
    },
    setLevel: async () => {
      throw new Error("not used");
    },
    resetLevels: async () => ({ archived: 0, alreadyReset: false }),
    topLevels: async () => [
      { guildId: "guild-1", userId: "target", xp: 240, level: 2, updatedAt: "" },
    ],
    getBalance: async () => 60,
    addLedger: async () => ({ inserted: true, balance: 60 }),
    spend: async () => ({ ok: true, inserted: true, balance: 60 }),
    transfer: async () => ({ ok: true, fromBalance: 60, toBalance: 60 }),
    listLedger: async () => [
      {
        id: "ledger-1",
        guildId: "guild-1",
        userId: "target",
        amount: 25,
        reason: "daily",
        idempotencyKey: "daily:1",
        createdAt: "2026-11-05T12:00:00.000Z",
      },
    ],
    topBalances: async () => [{ userId: "target", balance: 60 }],
    createTicket: async () => {
      throw new Error("not used");
    },
    getTicket: async () => undefined,
    listTickets: async () => [],
    updateTicket: async () => undefined,
    appendTicketEvent: async () => {
      throw new Error("not used");
    },
    listTicketEvents: async () => [],
    getRecord: async () => undefined,
    putRecord: async () => {
      throw new Error("not used");
    },
    claimSent: async () => undefined,
    listRecords: async () => [],
    deleteRecord: async () => undefined,
  } as CommunityStore;
}

function fakeInvites(): InvitePort {
  return {
    store: {
      recordJoin: async () => false,
      recordLeave: async () => false,
      leaderboard: async () => [],
      statsFor: async () => ({ inviterId: "target", joins: 4, leaves: 1, retained: 3 }),
      invitee: async () => ({
        guildId: "guild-1",
        userId: "target",
        inviterId: "inviter-1",
        joinedAt: "2026-11-04T08:00:00.000Z",
        fakeReasons: [],
      }),
    },
    actions: { notify: async () => undefined },
  };
}

function fakeForms(): FormStore {
  return {
    createForm: async () => {
      throw new Error("not used");
    },
    getForm: async () => undefined,
    listForms: async () => [],
    updateForm: async () => undefined,
    deleteForm: async () => false,
    countSubmissions: async () => 0,
    createSubmission: async () => {
      throw new Error("not used");
    },
    getSubmission: async () => undefined,
    listSubmissions: async () => [
      {
        id: "submission-1",
        guildId: "guild-1",
        formId: "form-1",
        userId: "target",
        answers: {},
        state: "accepted",
        createdAt: "2026-11-05T07:00:00.000Z",
        updatedAt: "2026-11-05T07:00:00.000Z",
      },
    ],
    reviewSubmission: async () => undefined,
  } as FormStore;
}

function fakeEvents(): EventStore {
  return {
    listEvents: async () => [],
    getRsvp: async () => undefined,
  } as unknown as EventStore;
}

function fakeModmail(): ModmailStore {
  return {
    listThreads: async () => [],
  } as unknown as ModmailStore;
}

async function buildContext(options: Record<string, string | number | boolean | null>) {
  const cases = new CaseService(new InMemoryCaseStore());
  const record = await cases.open({
    guildId: "guild-1",
    actorId: "mod-1",
    targetId: "target",
    action: "ban",
    reason: "raid invites",
    state: "open",
  });
  const interaction = new FakeInteraction({
    commandName: "mod",
    guildId: "guild-1",
    userId: "mod-1",
    permissions: ["ModerateMembers"],
    options: { action: "history", ...options },
    subcommand: "history",
  });
  const moderation: ModerationPort = {
    cases,
    actions: {} as ModerationPort["actions"],
    members: new InMemoryMemberStore(),
  };
  const ctx = createTestContext({
    interaction,
    moduleId: "moderation",
    settings: { dryRun: false },
    moderation,
    community: { store: fakeCommunity(), actions: {} } as unknown as CommunityPort,
    invites: fakeInvites(),
    forms: fakeForms(),
    events: fakeEvents(),
    modmail: fakeModmail(),
  });
  return { ctx, interaction, record };
}

describe("mod history member timeline", () => {
  it("renders the cross-module timeline when a user is supplied", async () => {
    const { ctx, interaction } = await buildContext({ user: "target" });
    await mod.execute(ctx);

    const reply = interaction.lastReply;
    expect(reply?.v2).toBeDefined();
    expect(reply?.embeds).toBeUndefined();
    const text = JSON.stringify(reply?.v2);
    expect(text).toContain("Member timeline");
    expect(text).toContain("<@target>");
    expect(text).toContain("Case #1");
    expect(text).toContain("raid invites");
    expect(text).toContain("`cases`");
    expect(text).toContain("`economy_ledger`");
    expect(text).toContain("`form_submissions`");
    expect(text).toContain("`invite_joins`");
  });

  it("keeps the recent-case embed when no user is supplied", async () => {
    const { ctx, interaction } = await buildContext({});
    await mod.execute(ctx);

    expect(interaction.lastReply?.v2).toBeUndefined();
    expect(interaction.lastReply?.embeds?.[0]?.title).toBe("Recent cases");
  });
});
