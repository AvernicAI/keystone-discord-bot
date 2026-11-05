import { describe, expect, it } from "vitest";
import type {
  CaseEvent,
  EventDefinition,
  EventRsvp,
  FormDefinition,
  FormSubmission,
  InviteJoinRecord,
  MemberVerification,
  ModerationCase,
  ModmailThread,
  TicketRecord,
} from "@keystone/kernel";
import {
  MemberTimelineService,
  TIMELINE_DISPLAY_LIMIT,
  type MemberTimelinePorts,
} from "./member-timeline";

const caseRecord: ModerationCase = {
  id: "case-1",
  guildId: "guild-1",
  caseNumber: 7,
  actorId: "mod-1",
  targetId: "member-1",
  action: "ban",
  reason: "raid invites @everyone <@123>",
  state: "open",
  createdAt: "2026-11-05T10:00:00.000Z",
  updatedAt: "2026-11-05T10:00:00.000Z",
};

const events: CaseEvent[] = [
  {
    id: "event-1",
    caseId: "case-1",
    type: "created",
    actorId: "mod-1",
    createdAt: "2026-11-05T10:00:00.000Z",
  },
  {
    id: "event-2",
    caseId: "case-1",
    type: "note",
    actorId: "mod-1",
    data: { note: "reviewed the evidence" },
    createdAt: "2026-11-05T10:05:00.000Z",
  },
];

const ticket: TicketRecord = {
  id: "ticket-1",
  guildId: "guild-1",
  channelId: "channel-1",
  openerId: "member-1",
  state: "closed",
  subject: "payment help",
  closedAt: "2026-11-05T09:00:00.000Z",
  createdAt: "2026-11-05T08:00:00.000Z",
  updatedAt: "2026-11-05T09:00:00.000Z",
};

const invite: InviteJoinRecord = {
  guildId: "guild-1",
  userId: "member-1",
  inviterId: "inviter-1",
  code: "abc",
  joinedAt: "2026-11-04T08:00:00.000Z",
  fakeReasons: [],
};

const form: FormDefinition = {
  id: "form-1",
  guildId: "guild-1",
  key: "apply",
  name: "Staff application",
  description: "Apply",
  fields: [],
  state: "open",
  createdBy: "mod-1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const submission: FormSubmission = {
  id: "submission-1",
  guildId: "guild-1",
  formId: "form-1",
  userId: "member-1",
  answers: {},
  state: "accepted",
  createdAt: "2026-11-05T07:00:00.000Z",
  updatedAt: "2026-11-05T07:00:00.000Z",
};

const event: EventDefinition = {
  id: "event-id",
  guildId: "guild-1",
  key: "game-night",
  name: "Game night",
  description: "Bring a game",
  state: "open",
  startsAt: "2026-11-06T18:00:00.000Z",
  location: "voice",
  createdBy: "mod-1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  reminderCount: 0,
};

const rsvp: EventRsvp = {
  id: "rsvp-1",
  guildId: "guild-1",
  eventId: "event-id",
  userId: "member-1",
  state: "going",
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

const thread: ModmailThread = {
  id: "thread-1",
  guildId: "guild-1",
  ownerId: "member-1",
  subject: "private question",
  state: "open",
  memberUnread: 1,
  staffUnread: 0,
  messageCount: 2,
  createdAt: "2026-11-05T06:00:00.000Z",
  updatedAt: "2026-11-05T06:00:00.000Z",
};

const member: MemberVerification = {
  guildId: "guild-1",
  userId: "member-1",
  joinedAt: "2026-11-04T08:00:00.000Z",
  quarantined: false,
  verifiedAt: "2026-11-04T09:00:00.000Z",
};

function allPorts(): MemberTimelinePorts {
  return {
    cases: {
      list: async (_guildId, filter) => (filter?.state === "open" ? [caseRecord] : [caseRecord]),
      listEvents: async () => events,
    },
    community: {
      getLevel: async () => ({
        guildId: "guild-1",
        userId: "member-1",
        xp: 1_240,
        level: 12,
        updatedAt: "2026-11-05T11:00:00.000Z",
      }),
      topLevels: async () => [
        { guildId: "guild-1", userId: "other", xp: 9_999, level: 99, updatedAt: "" },
        { guildId: "guild-1", userId: "member-1", xp: 1_240, level: 12, updatedAt: "" },
      ],
      getBalance: async () => 60,
      listLedger: async () => [
        {
          id: "ledger-1",
          guildId: "guild-1",
          userId: "member-1",
          amount: 25,
          reason: "daily",
          idempotencyKey: "daily:1",
          createdAt: "2026-11-05T12:00:00.000Z",
        },
      ],
      listTickets: async (_guildId, filter) => (filter?.state === "open" ? [] : [ticket]),
    },
    invites: {
      invitee: async () => invite,
      statsFor: async () => ({ inviterId: "member-1", joins: 4, leaves: 1, retained: 3 }),
    },
    forms: {
      listSubmissions: async () => [submission],
      listForms: async () => [form],
    },
    events: {
      listEvents: async () => [event],
      getRsvp: async () => rsvp,
    },
    modmail: {
      listThreads: async (_guildId, filter) => (filter?.state === "open" ? [thread] : [thread]),
    },
    members: {
      get: async () => member,
    },
  };
}

describe("member timeline read model", () => {
  it("joins every store, names the source table and sorts newest first", async () => {
    const timeline = await new MemberTimelineService(allPorts()).load("guild-1", "member-1");

    expect(timeline.facts).toMatchObject({
      level: 12,
      xp: 1_240,
      rank: 2,
      balance: 60,
      invitedBy: "inviter-1",
      invitesRetained: 3,
      openCases: 1,
      openTickets: 0,
      openModmail: 1,
      verifiedAt: "2026-11-04T09:00:00.000Z",
    });

    const text = timeline.entries.map((entry) => `${entry.source} ${entry.text}`).join("\n");
    expect(text).toContain("cases **Case #7**");
    expect(text).toContain("case_events **Case #7** · note");
    expect(text).toContain("tickets **Ticket** · closed — payment help");
    expect(text).toContain("levels **Level 12**");
    expect(text).toContain("economy_ledger **Economy +25** · daily");
    expect(text).toContain("invite_joins **Joined**");
    expect(text).toContain("form_submissions **Form accepted** · Staff application");
    expect(text).toContain("event_rsvps **Event going** · Game night");
    expect(text).toContain("modmail_threads **Modmail open** · private question");
    expect(text).toContain("members **Verification completed**");

    expect(timeline.entries[0]?.at).toBe("2026-11-05T12:00:00.000Z");
    expect(timeline.sources.find((source) => source.source === "cases")?.state).toBe("ok");
    expect(timeline.sources.find((source) => source.source === "modmail_threads")?.rows).toBe(1);
  });

  it("neutralizes mentions from user-authored reasons and subjects", async () => {
    const timeline = await new MemberTimelineService(allPorts()).load("guild-1", "member-1");
    const text = timeline.entries.map((entry) => entry.text).join("\n");
    expect(text).toContain("@\u200beveryone");
    expect(text).not.toContain("@everyone");
    expect(text).toContain("<@\u200b123>");
  });

  it("caps the display without losing the count of older rows", async () => {
    const ports = allPorts();
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: `ledger-${index}`,
      guildId: "guild-1",
      userId: "member-1",
      amount: 1,
      reason: `row ${index}`,
      idempotencyKey: `row-${index}`,
      createdAt: new Date(Date.UTC(2026, 10, 5, 12, index)).toISOString(),
    }));
    const timeline = await new MemberTimelineService({
      ...ports,
      community: { ...ports.community!, listLedger: async () => rows },
    }).load("guild-1", "member-1");

    expect(timeline.entries).toHaveLength(TIMELINE_DISPLAY_LIMIT);
    expect(timeline.truncated).toBeGreaterThan(0);
  });

  it("reports a missing store and a failed store without throwing", async () => {
    const timeline = await new MemberTimelineService({
      cases: {
        list: async () => {
          throw new Error("database offline");
        },
        listEvents: async () => [],
      },
    }).load("guild-1", "member-1");

    expect(timeline.entries).toEqual([]);
    expect(timeline.sources.find((source) => source.source === "cases")?.state).toBe("failed");
    expect(timeline.sources.find((source) => source.source === "case_events")?.state).toBe("failed");
    expect(timeline.sources.find((source) => source.source === "levels")?.state).toBe("not-wired");
    expect(timeline.sources.find((source) => source.source === "form_submissions")?.state).toBe(
      "not-wired",
    );
  });

  it("returns a valid empty timeline when no ports are wired", async () => {
    const timeline = await new MemberTimelineService({}).load("guild-1", "member-1");
    expect(timeline.entries).toEqual([]);
    expect(timeline.facts).toEqual({ userId: "member-1" });
    expect(timeline.sources.every((source) => source.state === "not-wired")).toBe(true);
  });
});
