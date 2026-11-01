import { describe, expect, it } from "vitest";
import {
  ModuleRegistry,
  auditBudget,
  type LogEventInput,
  type ModerationCase,
} from "@keystone/kernel";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import { logging } from "./commands/logging";
import { logEmbed } from "./format";
import { loggingModule } from "./manifest";
import { LoggingService } from "./service";
import { loggingSettingsSchema } from "./settings";
import { InMemoryLoggingStore } from "./store";
import { RecordingLoggingActions, loggingTestSettings } from "./testing";

const NOW = 1_700_000_000_000;

function event(overrides: Partial<LogEventInput> = {}): LogEventInput {
  return {
    guildId: "guild-a",
    kind: "message_delete",
    actorId: "member-1",
    targetId: "member-1",
    channelId: "channel-1",
    messageId: "message-1",
    summary: "A message was deleted.",
    data: { content: "hello" },
    at: NOW,
    ...overrides,
  };
}

async function service(overrides: Record<string, unknown> = {}) {
  const store = new InMemoryLoggingStore();
  const actions = new RecordingLoggingActions();
  const settings = loggingTestSettings(overrides);
  const instance = new LoggingService(
    store,
    actions,
    { get: async () => settings, update: async () => settings },
    () => NOW,
  );
  return { store, actions, settings, instance };
}

async function context(
  options: Record<string, string | number | boolean | null> = {},
  settings: Record<string, unknown> = loggingTestSettings(),
) {
  const store = new InMemoryLoggingStore();
  const actions = new RecordingLoggingActions();
  const interaction = new FakeInteraction({
    commandName: "logging",
    guildId: "guild-a",
    userId: "operator-1",
    permissions: ["ManageGuild"],
    options,
    subcommand: typeof options.action === "string" ? options.action : undefined,
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "logging",
    settings,
    logging: { store, actions },
    now: () => NOW,
  });
  return { ctx, interaction, store, actions };
}

describe("logging settings and budget", () => {
  it("is off with all event toggles on by default", () => {
    const settings = loggingSettingsSchema.parse({});
    expect(settings.enabled).toBe(false);
    expect(settings.channelId).toBeUndefined();
    expect(settings.retentionDays).toBe(30);
    expect(Object.values(settings.events)).toEqual([true, true, true, true, true]);
  });

  it("is one root with seven subcommands inside the budget", () => {
    const registry = new ModuleRegistry().register(loggingModule);
    expect(registry.commandNames()).toEqual(["logging"]);
    expect(registry.getCommand("logging")?.definition.subcommands).toHaveLength(7);
    expect(auditBudget(registry).commands).toBe(1);
    expect(registry.intents()).toContain("GuildMessages");
    expect(registry.capabilityReport("minimal").disabledFeatures).toContain(
      "GuildMembers: logging — member join and leave logs are disabled; message and moderation logs still work",
    );
  });
});

describe("logging service", () => {
  it("does nothing while logging is disabled", async () => {
    const { store, actions, instance } = await service({ enabled: false });
    const result = await instance.record(event());
    expect(result).toEqual({ stored: false, delivered: false, reason: "disabled" });
    expect(await store.count("guild-a")).toBe(0);
    expect(actions.notices).toHaveLength(0);
  });

  it("stores an event before delivering it and renders message content", async () => {
    const { store, actions, instance } = await service();
    const result = await instance.record(event());
    expect(result).toEqual({ stored: true, delivered: true });
    expect(await store.count("guild-a")).toBe(1);
    expect(actions.notices).toHaveLength(1);
    expect(actions.notices[0]?.channelId).toBe("log-channel");
    expect(actions.notices[0]?.notice.embeds?.[0]?.title).toBe("Message deleted");
    expect(actions.notices[0]?.notice.embeds?.[0]?.fields).toContainEqual({
      name: "Content",
      value: "hello",
      inline: false,
    });
  });

  it("keeps the ledger when the channel is missing or delivery fails", async () => {
    const missing = await service({ channelId: null });
    expect(await missing.instance.record(event())).toEqual({
      stored: true,
      delivered: false,
      reason: "no-channel",
    });
    expect(await missing.store.count("guild-a")).toBe(1);
    expect(missing.actions.notices).toHaveLength(0);

    const failed = await service();
    failed.actions.result = { ok: false, detail: "Missing Access" };
    expect(await failed.instance.record(event())).toEqual({
      stored: true,
      delivered: false,
      reason: "delivery-failed",
    });
    expect(await failed.store.count("guild-a")).toBe(1);
  });

  it("honours a per-event toggle", async () => {
    const { store, actions, instance } = await service({
      events: { messageDelete: false },
    });
    expect((await instance.record(event())).reason).toBe("event-off");
    expect(await store.count("guild-a")).toBe(0);
    expect(actions.notices).toHaveLength(0);
  });

  it("maps a moderation case into the same stream", async () => {
    const { store, instance } = await service();
    const record: ModerationCase = {
      id: "case-id",
      guildId: "guild-a",
      caseNumber: 7,
      actorId: "mod-1",
      targetId: "member-1",
      action: "ban",
      reason: "raid advertising",
      rule: "manual",
      state: "open",
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    };
    await instance.recordCase(record);
    const [stored] = await store.list("guild-a", 10);
    expect(stored).toMatchObject({
      kind: "moderation_action",
      actorId: "mod-1",
      targetId: "member-1",
      summary: "raid advertising",
    });
    expect(stored?.data).toMatchObject({ caseNumber: 7, action: "ban" });
  });

  it("prunes only rows older than the configured retention", async () => {
    const { store, instance } = await service({ retentionDays: 7 });
    await store.append(event({ at: NOW - 10 * 86_400_000, summary: "old" }));
    await store.append(event({ at: NOW - 2 * 86_400_000, summary: "fresh" }));

    expect(await instance.prune("guild-a")).toBe(1);
    expect(await store.list("guild-a", 10)).toHaveLength(1);
    expect(await store.list("guild-a", 10)).toEqual([
      expect.objectContaining({ summary: "fresh" }),
    ]);
  });

  it("renders a case embed without inventing a punishment", async () => {
    const embed = logEmbed({
      id: "event-id",
      guildId: "guild-a",
      kind: "moderation_action",
      actorId: "mod-1",
      targetId: "member-1",
      summary: "manual review",
      data: { caseNumber: 3, action: "warn", state: "open", rule: "manual" },
      createdAt: new Date(NOW).toISOString(),
    });
    expect(embed.title).toBe("Moderation case");
    expect(embed.description).toContain("Case #3 · warn");
    expect(embed.fields).toContainEqual({ name: "State", value: "open", inline: true });
  });
});

describe("in-memory logging store", () => {
  it("isolates guilds and returns newest first", async () => {
    const store = new InMemoryLoggingStore();
    await store.append(event({ guildId: "guild-a", summary: "first", at: NOW - 1_000 }));
    await store.append(event({ guildId: "guild-a", summary: "second", at: NOW }));
    await store.append(event({ guildId: "guild-b", summary: "other" }));

    expect((await store.list("guild-a", 10)).map((row) => row.summary)).toEqual([
      "second",
      "first",
    ]);
    expect(await store.count("guild-a")).toBe(2);
    expect(await store.count("guild-b")).toBe(1);
  });
});

describe("/logging command", () => {
  it("setup tests the channel before enabling it", async () => {
    const { ctx, interaction, actions } = await context(
      { action: "setup", channel: "log-channel-2" },
      loggingTestSettings({ enabled: false, channelId: undefined }),
    );
    await logging.execute(ctx);
    expect(actions.notices[0]).toMatchObject({ channelId: "log-channel-2" });
    expect(await ctx.settings.get("guild-a")).toMatchObject({
      enabled: true,
      channelId: "log-channel-2",
    });
    expect(interaction.lastReply?.content).toContain("Logging enabled");
  });

  it("setup refuses to persist a channel it cannot post in", async () => {
    const { ctx } = await context(
      { action: "setup", channel: "bad-channel" },
      loggingTestSettings({ enabled: false, channelId: undefined }),
    );
    (ctx.logging?.actions as RecordingLoggingActions).result = {
      ok: false,
      detail: "Missing Access",
    };
    await expect(logging.execute(ctx)).rejects.toThrow(/Could not post/);
    expect((await ctx.settings.get("guild-a")).enabled).toBe(false);
  });

  it("channel sets and clears the destination", async () => {
    const first = await context({ action: "channel", channel: "other-log" });
    await logging.execute(first.ctx);
    expect((await first.ctx.settings.get("guild-a")).channelId).toBe("other-log");

    const second = await context({ action: "channel" });
    await logging.execute(second.ctx);
    expect((await second.ctx.settings.get("guild-a")).channelId).toBeNull();
    expect(second.interaction.lastReply?.content).toContain("cleared");
  });

  it("lists and toggles event types", async () => {
    const list = await context({ action: "events" });
    await logging.execute(list.ctx);
    expect(list.interaction.lastReply?.embeds?.[0]?.fields).toContainEqual(
      expect.objectContaining({ name: "Events" }),
    );

    const toggle = await context({ action: "events", event: "message_delete", enabled: false });
    await logging.execute(toggle.ctx);
    expect((await toggle.ctx.settings.get("guild-a")).events).toMatchObject({ messageDelete: false });
    expect(toggle.interaction.lastReply?.content).toContain("now off");
  });

  it("status reports the channel, toggles and stored count", async () => {
    const { ctx, interaction, store } = await context({ action: "status" });
    await store.append(event());
    await logging.execute(ctx);
    const embed = interaction.lastReply?.embeds?.[0];
    expect(embed?.fields).toContainEqual({ name: "Stored events", value: "1", inline: true });
    expect(embed?.fields?.find((field) => field.name === "Channel")?.value).toBe(
      "<#log-channel>",
    );
  });

  it("retention updates the window and prunes immediately", async () => {
    const { ctx, interaction, store } = await context({ action: "retention", days: 7 });
    await store.append(event({ at: NOW - 10 * 86_400_000 }));
    await logging.execute(ctx);
    expect((await ctx.settings.get("guild-a")).retentionDays).toBe(7);
    expect(await store.count("guild-a")).toBe(0);
    expect(interaction.lastReply?.content).toContain("Pruned 1 stored event");
  });

  it("export returns valid JSON with the settings and newest events", async () => {
    const { ctx, interaction, store } = await context({ action: "export" });
    await store.append(event());
    await logging.execute(ctx);
    const description = interaction.lastReply?.embeds?.[0]?.description ?? "";
    const json = description.replace(/^```json\n/, "").replace(/\n```$/, "");
    expect(JSON.parse(json)).toMatchObject({
      version: 1,
      guildId: "guild-a",
      settings: expect.objectContaining({ enabled: true }),
      events: [expect.objectContaining({ kind: "message_delete" })],
    });
  });

  it("disable keeps the configuration but stops new records", async () => {
    const { ctx, interaction } = await context({ action: "disable" });
    await logging.execute(ctx);
    expect((await ctx.settings.get("guild-a")).enabled).toBe(false);
    expect(interaction.lastReply?.content).toContain("Logging disabled");
  });

  it("refuses clearly when the composition root did not wire the port", async () => {
    const interaction = new FakeInteraction({
      commandName: "logging",
      guildId: "guild-a",
      permissions: ["ManageGuild"],
    });
    const ctx = createTestContext({ interaction, moduleId: "logging" });
    await expect(logging.execute(ctx)).rejects.toThrow(/not wired/i);
  });
});
