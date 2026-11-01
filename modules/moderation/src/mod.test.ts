import { describe, expect, it } from "vitest";
import {
  InMemoryCooldownStore,
  ModuleRegistry,
  SettingsService,
  auditBudget,
  dispatchCommand,
  type ModerationActions,
  type ModerationActionResult,
  type ModerationNotice,
} from "@keystone/kernel";
import { createTestContext, FakeInteraction, noopQueue, staticHealth } from "@keystone/testing";
import { appeal } from "./commands/appeal";
import { mod } from "./commands/mod";
import { verify } from "./commands/verify";
import { CaseService, InMemoryCaseStore, appealCustomId } from "./cases";
import { moderationModule } from "./manifest";

class RecordingActions implements ModerationActions {
  readonly calls: string[] = [];
  readonly notifications: ModerationNotice[] = [];

  private ok(): Promise<ModerationActionResult> {
    return Promise.resolve({ ok: true });
  }

  ban(guildId: string, userId: string): Promise<ModerationActionResult> {
    this.calls.push(`ban:${guildId}:${userId}`);
    return this.ok();
  }

  kick(): Promise<ModerationActionResult> {
    this.calls.push("kick");
    return this.ok();
  }

  timeout(): Promise<ModerationActionResult> {
    this.calls.push("timeout");
    return this.ok();
  }

  purge(): Promise<ModerationActionResult> {
    this.calls.push("purge");
    return this.ok();
  }

  lock(): Promise<ModerationActionResult> {
    this.calls.push("lock");
    return this.ok();
  }

  slowmode(): Promise<ModerationActionResult> {
    this.calls.push("slowmode");
    return this.ok();
  }

  deleteMessage(): Promise<ModerationActionResult> {
    return this.ok();
  }

  deleteWebhook(): Promise<ModerationActionResult> {
    return this.ok();
  }

  quarantine(): Promise<ModerationActionResult> {
    this.calls.push("quarantine");
    return this.ok();
  }

  unquarantine(): Promise<ModerationActionResult> {
    this.calls.push("unquarantine");
    return this.ok();
  }

  async notify(_guildId: string, _channelId: string | null | undefined, notice: ModerationNotice): Promise<void> {
    this.notifications.push(notice);
  }
}

type OptionValues = Record<string, string | number | boolean | null>;

function buildContext(options: OptionValues, userId = "mod-1") {
  const store = new InMemoryCaseStore();
  const cases = new CaseService(store);
  const actions = new RecordingActions();
  const interaction = new FakeInteraction({
    commandName: "mod",
    guildId: "guild-1",
    userId,
    permissions: ["ModerateMembers"],
    options,
    subcommand: typeof options.action === "string" ? options.action : undefined,
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "moderation",
    settings: { dryRun: false, ...options },
    moderation: { cases, actions },
  });
  return { ctx, cases, actions, store };
}

describe("moderation module", () => {
  it("registers through the normal registry and stays inside the command budget", () => {
    const registry = new ModuleRegistry().register(moderationModule);
    expect(registry.getCommand("mod")?.moduleId).toBe("moderation");
    expect(registry.getCommand("appeal")?.moduleId).toBe("moderation");
    expect(registry.getCommand("verify")?.moduleId).toBe("moderation");
    expect(auditBudget(registry).status).toBe("ok");
  });

  it("blocks a caller without ModerateMembers through dispatch", async () => {
    const registry = new ModuleRegistry().register(moderationModule);
    const interaction = new FakeInteraction({
      commandName: "mod",
      permissions: ["SendMessages"],
      options: { user: "target", reason: "raid" },
      subcommand: "ban",
    });
    const outcome = await dispatchCommand(
      {
        registry,
        settings: new SettingsService(new (await import("@keystone/kernel")).InMemorySettingsRepository(), registry),
        logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } },
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
      },
      interaction,
    );
    expect(outcome.status).toBe("blocked");
    expect(interaction.lastReply?.content).toContain("ModerateMembers");
  });

  it("runs an enforced ban only after creating its case and reason", async () => {
    const { ctx, cases, actions } = buildContext({
      action: "ban",
      user: "target-1",
      reason: "posting raid invites",
    });

    await mod.execute(ctx);

    expect(actions.calls).toContain("ban:guild-1:target-1");
    const records = await cases.list("guild-1");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: "ban",
      targetId: "target-1",
      reason: "posting raid invites",
      state: "open",
    });
    expect(actions.notifications).toHaveLength(1);
    expect(actions.notifications[0]?.components?.[0]?.components[0]?.customId).toBe(
      appealCustomId(records[0]!.id),
    );
  });

  it("takes no action and writes no case in the default dry-run", async () => {
    const store = new InMemoryCaseStore();
    const cases = new CaseService(store);
    const actions = new RecordingActions();
    const interaction = new FakeInteraction({
      commandName: "mod",
      guildId: "guild-1",
      permissions: ["ModerateMembers"],
      options: { user: "target-1", reason: "raid" },
      subcommand: "ban",
    });
    const ctx = createTestContext({
      interaction,
      moduleId: "moderation",
      settings: {},
      moderation: { cases, actions },
    });

    await mod.execute(ctx);

    expect(actions.calls).toEqual([]);
    expect(await cases.list("guild-1")).toEqual([]);
    expect(interaction.lastReply?.content).toContain("Dry run");
  });

  it("lists recent link-filter findings through /mod links", async () => {
    const { ctx, cases, actions } = buildContext({ action: "links" });
    await cases.open({
      guildId: "guild-1",
      actorId: "keystone",
      targetId: "target-1",
      action: "security.alert",
      reason: "The link host phish.test is on this server's blocklist.",
      rule: "automod.link",
      state: "alerted",
    });

    await mod.execute(ctx);

    expect(actions.calls).toEqual([]);
    expect(ctx.interaction.lastReply?.content).toContain("Link-filter findings");
    expect(ctx.interaction.lastReply?.content).toContain("phish.test");
    expect(ctx.interaction.lastReply?.content).toContain("#1");
  });

  it("lists profanity and zalgo cases through /mod filters", async () => {
    const { ctx, cases, actions } = buildContext({ action: "filters" });
    await cases.open({
      guildId: "guild-1",
      actorId: "keystone",
      targetId: "target-1",
      action: "security.alert",
      reason: "The message contains a blocked word or phrase.",
      rule: "automod.profanity",
      state: "alerted",
    });
    await cases.open({
      guildId: "guild-1",
      actorId: "keystone",
      targetId: "target-1",
      action: "security.alert",
      reason: "The message contains 12 combining marks.",
      rule: "automod.zalgo",
      state: "alerted",
    });

    await mod.execute(ctx);

    expect(actions.calls).toEqual([]);
    expect(ctx.interaction.lastReply?.content).toContain("Content-filter findings");
    expect(ctx.interaction.lastReply?.content).toContain("automod.profanity");
    expect(ctx.interaction.lastReply?.content).toContain("automod.zalgo");
  });

  it("requires a reason for a punitive action", async () => {
    const { ctx } = buildContext({ action: "kick", user: "target-1" });
    await expect(mod.execute(ctx)).rejects.toThrow(/reason is required/i);
  });

  it("opens and verifies an appeal for the target only", async () => {
    const { ctx, cases, store } = buildContext({ action: "warn", user: "target-1", reason: "first warning" });
    await mod.execute(ctx);
    const record = (await cases.list("guild-1"))[0]!;

    const targetInteraction = new FakeInteraction({
      commandName: "appeal",
      guildId: "guild-1",
      userId: "target-1",
      options: { case: record.caseNumber, message: "I did not post that." },
    });
    const targetCtx = createTestContext({
      interaction: targetInteraction,
      moduleId: "moderation",
      settings: { appealsEnabled: true },
      moderation: { cases, actions: new RecordingActions() },
    });
    await appeal.execute(targetCtx);

    expect((await store.getById(record.id))?.state).toBe("appealed");
    expect(store.events(record.id).some((event) => event.type === "appealed")).toBe(true);

    const otherInteraction = new FakeInteraction({
      commandName: "appeal",
      guildId: "guild-1",
      userId: "someone-else",
      options: { case: record.caseNumber },
    });
    const otherCtx = createTestContext({
      interaction: otherInteraction,
      moduleId: "moderation",
      settings: { appealsEnabled: true },
      moderation: { cases, actions: new RecordingActions() },
    });
    await expect(appeal.execute(otherCtx)).rejects.toThrow(/only appeal a case against you/i);
  });

  it("verifies a quarantined member through the join gate", async () => {
    const { ctx, actions } = buildContext({});
    const verifyInteraction = new FakeInteraction({
      commandName: "verify",
      guildId: "guild-1",
      userId: "new-member",
      options: {},
    });
    const verifyCtx = createTestContext({
      interaction: verifyInteraction,
      moduleId: "moderation",
      settings: { joinGate: { enabled: true } },
      moderation: { cases: new CaseService(new InMemoryCaseStore()), actions },
    });

    await verify.execute(verifyCtx);
    expect(actions.calls).toContain("unquarantine");
    expect(verifyInteraction.lastReply?.content).toContain("Verified");
    expect(ctx.interaction.commandName).toBe("mod");
  });
});
