import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryCooldownStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  UserError,
  cooldown,
  createSilentLogger,
  defineCommand,
  defineModule,
  dispatchCommand,
  requireGuild,
  requirePermissions,
  type DispatchDeps,
} from "./index";
import { FakeInteraction, noopQueue, staticHealth } from "./testing";

const NOW = 1_700_000_000_000;

function buildDeps(): DispatchDeps {
  const manifest = defineModule({
    id: "mod",
    name: "Moderation",
    description: "Test module",
    version: "0.0.1",
    settingsSchema: z.object({}),
    defaultSettings: {},
    commands: [
      defineCommand({
        name: "guild-only",
        description: "Guild only",
        guards: [requireGuild],
        async execute(ctx) {
          await ctx.interaction.reply({ content: "ok" });
        },
      }),
      defineCommand({
        name: "admin-only",
        description: "Needs ManageGuild",
        guards: [requirePermissions("ManageGuild")],
        async execute(ctx) {
          await ctx.interaction.reply({ content: "ok" });
        },
      }),
      defineCommand({
        name: "boom",
        description: "Throws an internal error",
        async execute() {
          throw new Error("connection string postgres://user:hunter2@db");
        },
      }),
      defineCommand({
        name: "friendly",
        description: "Throws a user-facing error",
        async execute() {
          throw new UserError("That channel is already archived.");
        },
      }),
      defineCommand({
        name: "slow",
        description: "Rate limited",
        guards: [cooldown(5_000)],
        async execute(ctx) {
          await ctx.interaction.reply({ content: "ok" });
        },
      }),
      defineCommand({
        name: "hub",
        description: "A subcommand hub",
        subcommands: [
          { name: "one", description: "First" },
          { name: "two", description: "Second", options: [
            { type: "string", name: "value", description: "A value" },
          ] },
        ],
        async execute(ctx) {
          await ctx.interaction.reply({
            content: `${ctx.commandPath.join("/")}:${String(ctx.interaction.options.value ?? "")}`,
          });
        },
      }),
    ],
  });

  const registry = new ModuleRegistry().register(manifest);
  return {
    registry,
    settings: new SettingsService(new InMemorySettingsRepository(), registry),
    logger: createSilentLogger(),
    cooldowns: new InMemoryCooldownStore(),
    queue: noopQueue,
    health: staticHealth(),
    now: () => NOW,
  };
}

describe("dispatchCommand", () => {
  it("runs the command and replies", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "guild-only" });
    await expect(dispatchCommand(deps, interaction)).resolves.toEqual({ status: "ok" });
    expect(interaction.lastReply?.content).toBe("ok");
  });

  it("blocks a guild command used in a DM", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "guild-only", guildId: null });
    const outcome = await dispatchCommand(deps, interaction);
    expect(outcome.status).toBe("blocked");
    expect(interaction.lastReply?.content).toMatch(/only works inside a server/);
  });

  it("blocks a command when the member lacks the permission", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({
      commandName: "admin-only",
      permissions: ["SendMessages"],
    });
    const outcome = await dispatchCommand(deps, interaction);
    expect(outcome.status).toBe("blocked");
    expect(interaction.lastReply?.content).toContain("ManageGuild");
  });

  it("lets an Administrator through without listing every permission", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({
      commandName: "admin-only",
      permissions: ["Administrator"],
    });
    await expect(dispatchCommand(deps, interaction)).resolves.toEqual({ status: "ok" });
  });

  it("never leaks internal error details to the user", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "boom" });
    const outcome = await dispatchCommand(deps, interaction);

    expect(outcome.status).toBe("error");
    expect(outcome.message).not.toContain("hunter2");
    expect(interaction.lastReply?.content).not.toContain("hunter2");
    expect(interaction.lastReply?.ephemeral).toBe(true);
  });

  it("shows UserError messages verbatim", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "friendly" });
    const outcome = await dispatchCommand(deps, interaction);
    expect(outcome.message).toBe("That channel is already archived.");
  });

  it("dispatches a subcommand and exposes its path", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({
      commandName: "hub",
      subcommand: "two",
      options: { value: "ok" },
    });
    await expect(dispatchCommand(deps, interaction)).resolves.toEqual({ status: "ok" });
    expect(interaction.lastReply?.content).toBe("two:ok");
  });

  it("rejects a subcommand that the root does not declare", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "hub", subcommand: "nope" });
    await expect(dispatchCommand(deps, interaction)).resolves.toEqual({
      status: "unknown-command",
    });
  });

  it("enforces a cooldown per user", async () => {
    const deps = buildDeps();
    const first = new FakeInteraction({ commandName: "slow", userId: "7" });
    const second = new FakeInteraction({ commandName: "slow", userId: "7" });
    const otherUser = new FakeInteraction({ commandName: "slow", userId: "8" });

    expect((await dispatchCommand(deps, first)).status).toBe("ok");
    expect((await dispatchCommand(deps, second)).status).toBe("blocked");
    expect((await dispatchCommand(deps, otherUser)).status).toBe("ok");
  });

  it("reports an unknown command without throwing", async () => {
    const deps = buildDeps();
    const interaction = new FakeInteraction({ commandName: "does-not-exist" });
    await expect(dispatchCommand(deps, interaction)).resolves.toEqual({
      status: "unknown-command",
    });
  });

  it("records one usage row and never fails the command when analytics throws", async () => {
    const deps = buildDeps();
    const rows: import("./analytics").CommandUsageInput[] = [];
    deps.usage = {
      record: async (input) => {
        rows.push(input);
      },
    };

    await dispatchCommand(deps, new FakeInteraction({ commandName: "guild-only" }));
    expect(rows).toEqual([
      expect.objectContaining({ guildId: "1", command: "guild-only", path: "", status: "ok" }),
    ]);

    deps.usage = {
      record: async () => {
        throw new Error("analytics is down");
      },
    };
    await expect(
      dispatchCommand(deps, new FakeInteraction({ commandName: "guild-only" })),
    ).resolves.toEqual({ status: "ok" });
  });
});
