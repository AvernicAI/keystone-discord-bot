import { describe, expect, it } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { defineCommand } from "@keystone/kernel";
import { asInteractionLike, buildCommandJson } from "./adapt";

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

describe("asInteractionLike", () => {
  it("flattens a subcommand's nested options into the structural map", () => {
    const interaction = {
      id: "interaction-1",
      commandName: "mod",
      guildId: "guild-1",
      channelId: "channel-1",
      user: { id: "user-1" },
      memberPermissions: { toArray: () => ["BanMembers"] },
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
});
