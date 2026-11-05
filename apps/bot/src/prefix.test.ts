import { EventEmitter } from "node:events";
import { z } from "zod";
import { Events, MessageFlags, type Client, type Message } from "discord.js";
import {
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  createSilentLogger,
  defineCommand,
  type CommandContext,
  type CooldownStore,
  type JobQueue,
} from "@keystone/kernel";
import { describe, expect, it, vi } from "vitest";
import { parsePrefixArgs, registerPrefixCommands, tokenizePrefix } from "./prefix";

const GUILD = "1450130465146142785";
const BOT = "1549086192794992710";

const demo = defineCommand({
  name: "demo",
  description: "A command used by the prefix bridge test.",
  options: [
    {
      type: "string",
      name: "action",
      description: "What to do",
      required: true,
      choices: [
        { name: "status", value: "status" },
        { name: "say", value: "say" },
      ],
    },
    { type: "string", name: "name", description: "Text to echo" },
    { type: "integer", name: "amount", description: "A number", minValue: 1, maxValue: 10 },
  ],
  async execute(ctx: CommandContext) {
    await ctx.interaction.reply({
      content: `action=${String(ctx.interaction.options.action)} name=${String(ctx.interaction.options.name)} amount=${String(ctx.interaction.options.amount)}`,
    });
  },
});

const hub = defineCommand({
  name: "hub",
  description: "A subcommand hub used by the prefix bridge test.",
  subcommands: [
    { name: "status", description: "Show status" },
    {
      name: "say",
      description: "Echo text",
      options: [
        { type: "string", name: "name", description: "Text to echo" },
        { type: "integer", name: "amount", description: "A number", minValue: 1, maxValue: 10 },
      ],
    },
  ],
  async execute(ctx: CommandContext) {
    await ctx.interaction.reply({
      content: `${ctx.commandPath.join("/")}:${String(ctx.interaction.options.name)}:${String(ctx.interaction.options.amount)}`,
    });
  },
});

describe("prefix parsing", () => {
  it("keeps quoted values together", () => {
    expect(tokenizePrefix('say name="hello world" amount=2')).toEqual([
      "say",
      'name=hello world',
      "amount=2",
    ]);
  });

  it("uses the first token as the action and parses typed options", () => {
    const parsed = parsePrefixArgs(demo, tokenizePrefix('say name="hello world" amount=2'));
    expect(parsed.options).toEqual({ action: "say", name: "hello world", amount: 2 });
  });

  it("rejects an unknown action with the valid list", () => {
    expect(() => parsePrefixArgs(demo, ["explode"])).toThrow(/status, say/);
  });

  it("rejects a missing required action", () => {
    expect(() => parsePrefixArgs(demo, [])).toThrow(/Missing required option "action"/);
  });

  it("enforces integer bounds", () => {
    expect(() => parsePrefixArgs(demo, ["say", "amount=11"])).toThrow(/at most 10/);
  });

  it("rejects an unknown option instead of guessing", () => {
    expect(() => parsePrefixArgs(demo, ["status", "colour=blue"])).toThrow(/Unknown option "colour"/);
  });

  it("resolves a true subcommand and parses its options", () => {
    const parsed = parsePrefixArgs(hub, ["say", "name=hello", "amount=2"]);
    expect(parsed.subcommand).toBe("say");
    expect(parsed.subcommandGroup).toBeUndefined();
    expect(parsed.options).toEqual({ name: "hello", amount: 2 });
  });

  it("requires a subcommand and names the valid choices", () => {
    expect(() => parsePrefixArgs(hub, [])).toThrow(/Choose a subcommand/);
    expect(() => parsePrefixArgs(hub, ["explode"])).toThrow(/status, say/);
  });
});

function fakeMessage(content: string) {
  const send = vi.fn(async (_body: Record<string, unknown>) => ({ edit: vi.fn(async () => undefined) }));
  const message = {
    id: "123456789012345678",
    content,
    guildId: GUILD,
    channelId: "1566291983377367080",
    author: { id: "1493685079468146808", bot: true },
    member: { permissions: { toArray: () => ["Administrator"] } },
    channel: { send, sendTyping: vi.fn(async () => undefined) },
    reply: vi.fn(async () => undefined),
    mentions: { has: () => false },
  } as unknown as Message;
  return { message, send };
}

describe("prefix bridge", () => {
  it("dispatches through the real pipeline and replies in the channel", async () => {
    const client = Object.assign(new EventEmitter(), {
      user: { id: BOT },
    }) as unknown as Client;
    const registry = new ModuleRegistry().register({
      id: "test",
      name: "Test",
      description: "Test module",
      version: "0.1.0",
      settingsSchema: z.object({}),
      defaultSettings: {},
      commands: [demo],
    });
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    const cooldowns: CooldownStore = {
      hit: async () => ({ allowed: true, retryAfterMs: 0 }),
    };
    const queue: JobQueue = { enqueue: async () => "job", close: async () => undefined };
    const health = {
      probe: async () => ({
        database: { configured: false, reachable: false, migrated: false },
        cache: { configured: false, reachable: false },
      }),
    };
    registerPrefixCommands(
      client,
      { registry, settings, logger: createSilentLogger(), cooldowns, queue, health },
      { guildId: GUILD },
    );

    const { message, send } = fakeMessage('!demo say name="hello world" amount=2');
    (client as unknown as EventEmitter).emit(Events.MessageCreate, message);

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      content: "action=say name=hello world amount=2",
      allowedMentions: { parse: [] },
    });
  });

  it("preserves a Components V2 reply instead of flattening it", async () => {
    const panel = defineCommand({
      name: "panel",
      description: "A V2 reply used by the prefix bridge test.",
      async execute(ctx: CommandContext) {
        await ctx.interaction.reply({
          v2: [
            {
              type: "container",
              accentColor: 0x5865f2,
              components: [{ type: "text-display", content: "V2 bridge panel" }],
            },
          ],
        });
      },
    });
    const client = Object.assign(new EventEmitter(), {
      user: { id: BOT },
    }) as unknown as Client;
    const registry = new ModuleRegistry().register({
      id: "test",
      name: "Test",
      description: "Test module",
      version: "0.1.0",
      settingsSchema: z.object({}),
      defaultSettings: {},
      commands: [panel],
    });
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    registerPrefixCommands(
      client,
      {
        registry,
        settings,
        logger: createSilentLogger(),
        cooldowns: { hit: async () => ({ allowed: true, retryAfterMs: 0 }) },
        queue: { enqueue: async () => "job", close: async () => undefined },
        health: {
          probe: async () => ({
            database: { configured: false, reachable: false, migrated: false },
            cache: { configured: false, reachable: false },
          }),
        },
      },
      { guildId: GUILD },
    );

    const { message, send } = fakeMessage("!panel");
    (client as unknown as EventEmitter).emit(Events.MessageCreate, message);

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.flags).toBe(MessageFlags.IsComponentsV2);
    expect(body.content).toBeUndefined();
    expect(body.v2).toBeUndefined();
    expect(body.ephemeral).toBeUndefined();
    expect(JSON.stringify(body.components)).toContain("V2 bridge panel");
  });

  it("ignores the prefix in another guild", async () => {
    const client = Object.assign(new EventEmitter(), {
      user: { id: BOT },
    }) as unknown as Client;
    const registry = new ModuleRegistry().register({
      id: "test",
      name: "Test",
      description: "Test module",
      version: "0.1.0",
      settingsSchema: z.object({}),
      defaultSettings: {},
      commands: [demo],
    });
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    const stop = registerPrefixCommands(
      client,
      {
        registry,
        settings,
        logger: createSilentLogger(),
        cooldowns: { hit: async () => ({ allowed: true, retryAfterMs: 0 }) },
        queue: { enqueue: async () => "job", close: async () => undefined },
        health: {
          probe: async () => ({
            database: { configured: false, reachable: false, migrated: false },
            cache: { configured: false, reachable: false },
          }),
        },
      },
      { guildId: GUILD },
    );
    const { message, send } = fakeMessage("!demo status");
    (message as { guildId: string }).guildId = "111111111111111111";
    (client as unknown as EventEmitter).emit(Events.MessageCreate, message);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(send).not.toHaveBeenCalled();
    stop();
  });

  it("dispatches a true subcommand through the real pipeline", async () => {
    const client = Object.assign(new EventEmitter(), {
      user: { id: BOT },
    }) as unknown as Client;
    const registry = new ModuleRegistry().register({
      id: "test",
      name: "Test",
      description: "Test module",
      version: "0.1.0",
      settingsSchema: z.object({}),
      defaultSettings: {},
      commands: [hub],
    });
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    registerPrefixCommands(
      client,
      {
        registry,
        settings,
        logger: createSilentLogger(),
        cooldowns: { hit: async () => ({ allowed: true, retryAfterMs: 0 }) },
        queue: { enqueue: async () => "job", close: async () => undefined },
        health: {
          probe: async () => ({
            database: { configured: false, reachable: false, migrated: false },
            cache: { configured: false, reachable: false },
          }),
        },
      },
      { guildId: GUILD },
    );

    const { message, send } = fakeMessage('!hub say name="hello world" amount=2');
    (client as unknown as EventEmitter).emit(Events.MessageCreate, message);

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      content: "say:hello world:2",
      allowedMentions: { parse: [] },
    });
  });
});
