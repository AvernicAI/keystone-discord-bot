import { describe, expect, it, vi } from "vitest";
import { channelKind, DiscordDirectoryClient, DirectoryError } from "./directory";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CHANNELS = [
  { id: "3", name: "general", type: 0, parent_id: null, position: 2 },
  { id: "1", name: "INFO", type: 4, parent_id: null, position: 1 },
  { id: "2", name: "Voice", type: 2, parent_id: "1", position: 1 },
];

const ROLES = [
  { id: "20", name: "Member", color: 0, position: 1, managed: false, hoist: false },
  { id: "21", name: "Moderator", color: 0x5865f2, position: 5, managed: false, hoist: true },
];

describe("discord directory client", () => {
  it("reads channels and roles with the bot header, sorts them and caches them", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init ?? {}]);
      const path = String(url);
      return path.endsWith("/channels") ? json(CHANNELS) : json(ROLES);
    }) as typeof fetch;
    const client = new DiscordDirectoryClient({ token: "secret-bot-token", fetchImpl, now: () => 1_000 });
    const first = await client.guildResources("111111111111111111");
    expect(first.channels.map((channel) => channel.id)).toEqual(["1", "2", "3"]);
    expect(first.channels.find((channel) => channel.id === "2")).toMatchObject({
      kind: "voice",
      parentId: "1",
    });
    expect(first.roles.map((role) => role.id)).toEqual(["21", "20"]);
    expect(first.roles[0]).toMatchObject({ managed: false, hoist: true, color: 0x5865f2 });
    expect(calls).toHaveLength(2);

    const second = await client.guildResources("111111111111111111");
    expect(second).toBe(first);
    expect(calls).toHaveLength(2);

    const [url, init] = calls[0]!;
    expect(String(url)).toContain("/guilds/111111111111111111/channels");
    expect(init.headers).toMatchObject({
      Authorization: "Bot secret-bot-token",
    });
    expect(JSON.stringify(first)).not.toContain("secret-bot-token");
  });

  it("refreshes after the ttl", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/channels") ? json(CHANNELS) : json(ROLES),
    ) as unknown as typeof fetch;
    const client = new DiscordDirectoryClient({
      token: "token",
      fetchImpl,
      now: () => now,
      ttlMs: 50,
    });
    await client.guildResources("1");
    now = 51;
    await client.guildResources("1");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("turns a refused read into a named, actionable error", async () => {
    const fetchImpl = vi.fn(async () => json({ message: "Missing Access" }, 403)) as unknown as typeof fetch;
    const client = new DiscordDirectoryClient({ token: "token", fetchImpl });
    await expect(client.guildResources("1")).rejects.toMatchObject({
      name: "DirectoryError",
      unavailable: true,
    });
    await expect(client.guildResources("1")).rejects.toBeInstanceOf(DirectoryError);
    await expect(client.guildResources("1")).rejects.toThrow(/View Channels/);
  });

  it("reports rate limits without pretending the server is empty", async () => {
    const fetchImpl = vi.fn(async () => json({ retry_after: 2 }, 429)) as unknown as typeof fetch;
    const client = new DiscordDirectoryClient({ token: "token", fetchImpl });
    await expect(client.guildResources("1")).rejects.toThrow(/rate-limiting/);
  });

  it("rejects a malformed Discord payload", async () => {
    const fetchImpl = vi.fn(async () => json({ nope: true })) as unknown as typeof fetch;
    const client = new DiscordDirectoryClient({ token: "token", fetchImpl });
    await expect(client.guildResources("1")).rejects.toThrow(/unexpected shape/);
  });

  it("maps the channel types the dashboard renders", () => {
    expect(channelKind(0)).toBe("text");
    expect(channelKind(2)).toBe("voice");
    expect(channelKind(4)).toBe("category");
    expect(channelKind(5)).toBe("announcement");
    expect(channelKind(13)).toBe("stage");
    expect(channelKind(15)).toBe("forum");
    expect(channelKind(16)).toBe("media");
    expect(channelKind(99)).toBe("other");
  });
});
