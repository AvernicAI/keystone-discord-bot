import { describe, expect, it } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { defineCommand } from "@keystone/kernel";
import {
  asInteractionLike,
  buildApplicationCommandJson,
  buildCommandJson,
  buildContextMenuJson,
} from "./adapt";

interface JsonOption {
  name: string;
  type: number;
  options?: JsonOption[];
}

function optionsOf(json: ReturnType<typeof buildCommandJson>): JsonOption[] {
  return (json.options ?? []) as JsonOption[];
}

const noop = async () => undefined;

describe("buildCommandJson", () => {
  it("emits direct subcommands instead of a flat action option", () => {
    const json = buildCommandJson(
      defineCommand({
        name: "mod",
        description: "Moderation",
        subcommands: [
          {
            name: "ban",
            description: "Ban a member",
            options: [
              { type: "user", name: "user", description: "Member", required: true },
              { type: "string", name: "reason", description: "Reason", required: true },
            ],
          },
          { name: "history", description: "Show history" },
        ],
        execute: noop,
      }),
    );

    expect(optionsOf(json).map((option) => [option.name, option.type])).toEqual([
      ["ban", 1],
      ["history", 1],
    ]);
    expect(optionsOf(json)[0]?.options?.map((option) => [option.name, option.type])).toEqual([
      ["user", 6],
      ["reason", 3],
    ]);
  });

  it("emits a subcommand group with its own subcommands", () => {
    const json = buildCommandJson(
      defineCommand({
        name: "case",
        description: "Case commands",
        groups: [
          {
            name: "view",
            description: "View cases",
            subcommands: [
              { name: "one", description: "One case" },
              { name: "list", description: "List cases" },
            ],
          },
        ],
        execute: noop,
      }),
    );

    expect(optionsOf(json)[0]).toMatchObject({ name: "view", type: 2 });
    expect(optionsOf(json)[0]?.options?.map((option) => option.name)).toEqual(["one", "list"]);
  });

  it("emits an attachment option with Discord's attachment type", () => {
    const json = buildCommandJson(
      defineCommand({
        name: "export",
        description: "Export",
        subcommands: [
          {
            name: "import",
            description: "Import a bundle",
            options: [{ type: "attachment", name: "bundle", description: "Bundle", required: true }],
          },
        ],
        execute: noop,
      }),
    );

    expect(optionsOf(json)[0]?.options?.map((option) => [option.name, option.type])).toEqual([
      ["bundle", 11],
    ]);
  });

  it("keeps flat options for a root-only command", () => {
    const json = buildCommandJson(
      defineCommand({
        name: "ping",
        description: "Ping",
        options: [{ type: "boolean", name: "detailed", description: "More detail" }],
        execute: noop,
      }),
    );

    expect(optionsOf(json)).toEqual([
      expect.objectContaining({ name: "detailed", type: 5 }),
    ]);
  });

  it("emits no options for a command with none", () => {
    const json = buildCommandJson(
      defineCommand({ name: "about", description: "About", execute: noop }),
    );
    expect(json.options).toEqual([]);
  });
});

describe("context-menu payloads", () => {
  it("emits type 2 and type 3 without a description", () => {
    const user = buildApplicationCommandJson(
      defineCommand({
        name: "Rank card",
        description: "Show a rank card",
        type: "user",
        execute: noop,
      }),
    );
    const message = buildContextMenuJson(
      defineCommand({
        name: "Report message",
        description: "Report a message",
        type: "message",
        execute: noop,
      }),
    );
    expect(user).toMatchObject({ name: "Rank card", type: 2 });
    expect(message).toMatchObject({ name: "Report message", type: 3 });
    expect("description" in user).toBe(false);
    expect("description" in message).toBe(false);
  });

  it("refuses to build a context payload for a chat-input definition", () => {
    expect(() =>
      buildContextMenuJson(
        defineCommand({ name: "ping", description: "Ping", execute: noop }),
      ),
    ).toThrow(/not a context-menu/);
  });
});

describe("asInteractionLike context menus", () => {
  it("exposes the selected user", () => {
    const interaction = {
      id: "interaction-1",
      commandName: "Rank card",
      guildId: "guild-1",
      channelId: "channel-1",
      user: { id: "viewer" },
      memberPermissions: { toArray: () => [] },
      isChatInputCommand: () => false,
      isUserContextMenuCommand: () => true,
      isMessageContextMenuCommand: () => false,
      targetId: "author-1",
      replied: false,
      deferred: false,
      reply: noop,
      deferReply: noop,
      editReply: noop,
      followUp: noop,
    } as unknown as Parameters<typeof asInteractionLike>[0];

    const like = asInteractionLike(interaction);
    expect(like.commandType).toBe("user");
    expect(like.targetId).toBe("author-1");
    expect(like.options).toEqual({});
  });

  it("exposes the message author and content", () => {
    const interaction = {
      id: "interaction-2",
      commandName: "Report message",
      guildId: "guild-1",
      channelId: "channel-1",
      user: { id: "reporter" },
      memberPermissions: { toArray: () => [] },
      isChatInputCommand: () => false,
      isUserContextMenuCommand: () => false,
      isMessageContextMenuCommand: () => true,
      targetId: "message-1",
      targetMessage: { author: { id: "author-1" }, content: "spam" },
      replied: false,
      deferred: false,
      reply: noop,
      deferReply: noop,
      editReply: noop,
      followUp: noop,
    } as unknown as Parameters<typeof asInteractionLike>[0];

    const like = asInteractionLike(interaction);
    expect(like.commandType).toBe("message");
    expect(like.targetId).toBe("message-1");
    expect(like.targetUserId).toBe("author-1");
    expect(like.targetContent).toBe("spam");
  });
});

describe("asInteractionLike", () => {
  it("flattens a subcommand's nested options into the structural map", () => {
    const interaction = {
      id: "interaction-1",
      commandName: "mod",
      guildId: "guild-1",
      channelId: "channel-1",
      user: { id: "user-1" },
      memberPermissions: { toArray: () => ["BanMembers"] },
      isChatInputCommand: () => true,
      options: {
        data: [
          {
            name: "ban",
            type: 1,
            options: [
              { name: "user", type: 6, value: "target-1" },
              { name: "reason", type: 3, value: "spam" },
            ],
          },
        ],
        getSubcommand: () => "ban",
        getSubcommandGroup: () => null,
      },
      replied: false,
      deferred: false,
      reply: noop,
      deferReply: noop,
      editReply: noop,
      followUp: noop,
    } as unknown as ChatInputCommandInteraction;

    const like = asInteractionLike(interaction);

    expect(like.options).toEqual({ user: "target-1", reason: "spam" });
    expect(like.subcommand).toBe("ban");
    expect(like.permissions).toEqual(["BanMembers"]);
  });

  it("keeps an attachment's CDN URL and uploads a reply file", async () => {
    const captured: Array<{ files?: Array<{ name: string }> }> = [];
    const url = "https://cdn.discordapp.com/attachments/1/2/bundle.json";
    const interaction = {
      id: "interaction-2",
      commandName: "export",
      guildId: "guild-1",
      channelId: "channel-1",
      user: { id: "user-1" },
      memberPermissions: { toArray: () => ["ManageGuild"] },
      isChatInputCommand: () => true,
      options: {
        data: [
          {
            name: "import",
            type: 1,
            options: [{ name: "bundle", type: 11, attachment: { url } }],
          },
        ],
        getSubcommand: () => "import",
        getSubcommandGroup: () => null,
      },
      replied: false,
      deferred: false,
      reply: async (options: { files?: Array<{ name: string }> }) => {
        captured.push(options);
      },
      deferReply: noop,
      editReply: noop,
      followUp: noop,
    } as unknown as ChatInputCommandInteraction;

    const like = asInteractionLike(interaction);
    expect(like.options.bundle).toBe(url);

    await like.reply({
      content: "bundle",
      files: [{ name: "keystone.json", content: "{}" }],
    });
    expect(captured[0]?.files?.[0]?.name).toBe("keystone.json");
  });
});
