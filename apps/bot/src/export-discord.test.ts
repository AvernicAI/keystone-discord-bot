import { describe, expect, it } from "vitest";
import { ChannelType, type Client } from "discord.js";
import {
  createDiscordAttachmentReader,
  createDiscordExportFacts,
  isDiscordAttachmentUrl,
} from "./export-discord";

const CDN = "https://cdn.discordapp.com/attachments/1/2/bundle.json";

describe("Discord export adapters", () => {
  it("accepts only Discord CDN attachment URLs", () => {
    expect(isDiscordAttachmentUrl(CDN)).toBe(true);
    expect(isDiscordAttachmentUrl("https://media.discordapp.net/attachments/1/2/a.json")).toBe(true);
    expect(isDiscordAttachmentUrl("https://example.com/bundle.json")).toBe(false);
    expect(isDiscordAttachmentUrl("http://cdn.discordapp.com/bundle.json")).toBe(false);
    expect(isDiscordAttachmentUrl("not a url")).toBe(false);
  });

  it("downloads a bundle from the CDN and refuses another host before fetching", async () => {
    let calls = 0;
    const reader = createDiscordAttachmentReader(async () => {
      calls += 1;
      return new Response('{"manifest":{}}', { status: 200 });
    });

    await expect(reader.read("https://example.com/bundle.json")).rejects.toThrow(/Discord CDN/);
    expect(calls).toBe(0);
    await expect(reader.read(CDN)).resolves.toBe('{"manifest":{}}');
    expect(calls).toBe(1);
  });

  it("refuses a bundle whose declared size is over the cap", async () => {
    const reader = createDiscordAttachmentReader(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(26 * 1024 * 1024) },
        }),
    );

    await expect(reader.read(CDN)).rejects.toThrow(/larger than 25 MB/);
  });

  it("collects channels, categories, roles and AutoMod names from the live cache", async () => {
    const guild = {
      channels: {
        cache: new Map([
          ["channel-1", { id: "channel-1", type: ChannelType.GuildText }],
          ["category-1", { id: "category-1", type: ChannelType.GuildCategory }],
        ]),
      },
      roles: { cache: new Map([["role-1", { id: "role-1" }]]) },
      autoModerationRules: {
        fetch: async () => new Map([["rule-1", { name: "keystone-words" }]]),
      },
    };
    const client = {
      guilds: {
        cache: new Map([["guild-1", guild]]),
        fetch: async () => guild,
      },
    } as unknown as Client;

    const facts = await createDiscordExportFacts(client)("guild-1");
    expect(facts).toMatchObject({
      channels: ["channel-1"],
      categories: ["category-1"],
      roles: ["role-1"],
      automodRules: ["keystone-words"],
    });
  });
});
