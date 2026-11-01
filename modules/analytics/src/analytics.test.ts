import { describe, expect, it, vi } from "vitest";
import {
  InMemoryCooldownStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  createSilentLogger,
  dispatchCommand,
  type AnalyticsSnapshot,
  type AnalyticsStore,
} from "@keystone/kernel";
import { FakeInteraction, noopQueue, staticHealth } from "@keystone/testing";
import { analyticsModule } from ".";
import { MemoryAnalyticsStore, type AnalyticsMemorySource } from "./memory";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const WINDOW = {
  days: 7,
  since: "2026-10-25T12:00:00.000Z",
  until: "2026-11-01T12:00:00.000Z",
};

function snapshot(): AnalyticsSnapshot {
  return {
    version: 1,
    guildId: "guild-1",
    generatedAt: WINDOW.until,
    window: WINDOW,
    sources: [
      { id: "logging_events", label: "Audit events", rows: 3 },
      { id: "cases", label: "Moderation cases", rows: 2 },
      { id: "invite_joins", label: "Invite joins", rows: 2 },
      { id: "tickets", label: "Tickets", rows: 2 },
      { id: "command_usage", label: "Command runs", rows: 2 },
    ],
    overview: {
      loggedEvents: 3,
      activeCases: 1,
      casesOpened: 2,
      inviteJoins: 2,
      retainedInvites: 1,
      commandsRun: 2,
      openTickets: 1,
    },
    members: {
      loggedJoins: 2,
      loggedLeaves: 1,
      inviteJoins: 2,
      leftSince: 1,
      retained: 1,
      flagged: 1,
      uniqueInviters: 1,
    },
    messages: { deleted: 1, edited: 1, contentFilterCases: 1 },
    commands: {
      total: 2,
      ok: 1,
      blocked: 1,
      error: 0,
      averageLatencyMs: 25,
      top: [
        { command: "ping", path: "", total: 2, ok: 1, blocked: 1, error: 0, averageLatencyMs: 25 },
      ],
    },
    tickets: {
      open: 1,
      claimed: 0,
      closed: 1,
      opened: 2,
      closedInWindow: 1,
      averageCloseMinutes: 12.5,
      slaBreached: 0,
    },
  };
}

function deps(store: AnalyticsStore) {
  const registry = new ModuleRegistry().register(analyticsModule);
  return {
    registry,
    settings: new SettingsService(new InMemorySettingsRepository(), registry),
    logger: createSilentLogger(),
    cooldowns: new InMemoryCooldownStore(),
    queue: noopQueue,
    health: staticHealth(),
    analytics: store,
    now: () => NOW,
  };
}

describe("/analytics command", () => {
  it("reads the default window and renders the overview", async () => {
    const store = { snapshot: vi.fn(async () => snapshot()) };
    const interaction = new FakeInteraction({
      commandName: "analytics",
      guildId: "guild-1",
      subcommand: "overview",
      permissions: ["ManageGuild"],
    });

    const outcome = await dispatchCommand(deps(store), interaction);

    expect(outcome.status).toBe("ok");
    expect(store.snapshot).toHaveBeenCalledWith("guild-1", WINDOW);
    expect(interaction.lastReply?.embeds?.[0]?.title).toBe("Analytics overview");
    expect(interaction.lastReply?.content).toContain("3 logged events");
    expect(interaction.lastReply?.ephemeral).toBe(true);
  });

  it("uses the requested days option and rejects non-admins", async () => {
    const store = { snapshot: vi.fn(async () => snapshot()) };
    const admin = new FakeInteraction({
      commandName: "analytics",
      guildId: "guild-1",
      subcommand: "commands",
      permissions: ["ManageGuild"],
      options: { days: 30 },
    });
    const member = new FakeInteraction({
      commandName: "analytics",
      guildId: "guild-1",
      subcommand: "commands",
      permissions: ["SendMessages"],
      options: { days: 30 },
    });

    await dispatchCommand(deps(store), admin);
    expect(store.snapshot).toHaveBeenCalledWith("guild-1", {
      days: 30,
      since: "2026-10-02T12:00:00.000Z",
      until: WINDOW.until,
    });

    const blocked = await dispatchCommand(deps(store), member);
    expect(blocked.status).toBe("blocked");
    expect(store.snapshot).toHaveBeenCalledTimes(1);
  });

  it("refuses when the module is disabled", async () => {
    const store = { snapshot: vi.fn(async () => snapshot()) };
    const wired = deps(store);
    await wired.settings.update("guild-1", "analytics", { enabled: false });
    const interaction = new FakeInteraction({
      commandName: "analytics",
      guildId: "guild-1",
      subcommand: "overview",
      permissions: ["ManageGuild"],
    });

    const outcome = await dispatchCommand(wired, interaction);
    expect(outcome.status).toBe("error");
    expect(interaction.lastReply?.content).toMatch(/disabled/);
    expect(store.snapshot).not.toHaveBeenCalled();
  });

  it("exports a parseable JSON snapshot", async () => {
    const interaction = new FakeInteraction({
      commandName: "analytics",
      guildId: "guild-1",
      subcommand: "export",
      permissions: ["ManageGuild"],
    });

    await dispatchCommand(deps({ snapshot: async () => snapshot() }), interaction);
    const description = interaction.lastReply?.embeds?.[0]?.description ?? "";
    const json = description.replace(/^```json\n/, "").replace(/\n```$/, "");
    expect(JSON.parse(json)).toMatchObject({ version: 1, guildId: "guild-1" });
  });
});

describe("MemoryAnalyticsStore", () => {
  const source: AnalyticsMemorySource = {
    logs: async () => [
      { id: "1", guildId: "guild-1", kind: "member_join", summary: "join", createdAt: "2026-10-30T10:00:00.000Z" },
      { id: "2", guildId: "guild-1", kind: "member_join", summary: "join", createdAt: "2026-10-30T11:00:00.000Z" },
      { id: "3", guildId: "guild-1", kind: "message_delete", summary: "deleted", createdAt: "2026-10-31T10:00:00.000Z" },
      { id: "4", guildId: "guild-1", kind: "message_delete", summary: "outside window", createdAt: "2026-10-01T10:00:00.000Z" },
    ],
    cases: async () => [
      {
        id: "case-1",
        guildId: "guild-1",
        caseNumber: 1,
        actorId: "mod",
        targetId: "user",
        action: "alert",
        reason: "filter",
        rule: "automod.profanity",
        state: "open",
        createdAt: "2026-10-30T12:00:00.000Z",
        updatedAt: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "case-2",
        guildId: "guild-1",
        caseNumber: 2,
        actorId: "mod",
        targetId: "user",
        action: "warn",
        reason: "old",
        state: "closed",
        createdAt: "2026-10-01T12:00:00.000Z",
        updatedAt: "2026-10-01T12:00:00.000Z",
      },
    ],
    invites: async () => [
      { guildId: "guild-1", userId: "a", inviterId: "one", joinedAt: "2026-10-29T10:00:00.000Z", fakeReasons: [] },
      { guildId: "guild-1", userId: "b", inviterId: "one", joinedAt: "2026-10-30T10:00:00.000Z", leftAt: "2026-10-31T10:00:00.000Z", fakeReasons: ["account_age"] },
    ],
    tickets: async () => [
      {
        id: "t1", guildId: "guild-1", channelId: "c1", openerId: "a", state: "open", subject: "help",
        createdAt: "2026-10-29T09:00:00.000Z", updatedAt: "2026-10-29T09:00:00.000Z",
      },
      {
        id: "t2", guildId: "guild-1", channelId: "c2", openerId: "b", state: "closed", subject: "done",
        createdAt: "2026-10-28T09:00:00.000Z", closedAt: "2026-10-28T09:10:00.000Z",
        updatedAt: "2026-10-28T09:10:00.000Z",
      },
    ],
    commands: async () => [
      {
        id: "u1", guildId: "guild-1", command: "ping", path: "", status: "ok",
        durationMs: 10, at: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "u2", guildId: "guild-1", command: "ping", path: "", status: "ok",
        durationMs: 30, at: "2026-10-30T12:01:00.000Z",
      },
    ],
  };

  it("aggregates only rows inside the window and keeps source counts", async () => {
    const result = await new MemoryAnalyticsStore(source).snapshot("guild-1", WINDOW);

    expect(result.overview.loggedEvents).toBe(3);
    expect(result.overview.casesOpened).toBe(1);
    expect(result.overview.activeCases).toBe(1);
    expect(result.members).toMatchObject({
      loggedJoins: 2,
      loggedLeaves: 0,
      inviteJoins: 2,
      leftSince: 1,
      retained: 1,
      flagged: 1,
      uniqueInviters: 1,
    });
    expect(result.messages).toEqual({ deleted: 1, edited: 0, contentFilterCases: 1 });
    expect(result.commands).toMatchObject({ total: 2, ok: 2, averageLatencyMs: 20 });
    expect(result.tickets).toMatchObject({
      open: 1,
      closed: 1,
      opened: 2,
      closedInWindow: 1,
      averageCloseMinutes: 10,
    });
    expect(result.sources).toEqual([
      { id: "logging_events", label: "Audit events", rows: 3 },
      { id: "cases", label: "Moderation cases", rows: 1 },
      { id: "invite_joins", label: "Invite joins", rows: 2 },
      { id: "tickets", label: "Tickets", rows: 2 },
      { id: "command_usage", label: "Command runs", rows: 2 },
    ]);
  });
});
