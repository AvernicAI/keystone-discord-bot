import { describe, expect, it } from "vitest";
import { GuildAccessService, canManageGuild } from "./access";
import { HttpError } from "./http-error";
import type { DiscordGuild } from "./oauth";

const OWNER = 1n << 3n;
const MANAGE = 1n << 5n;

function guild(id: string, permissions = "0", owner = false): DiscordGuild {
  return { id, name: `Guild ${id}`, icon: null, owner, permissions };
}

function fakeOauth(guilds: readonly DiscordGuild[], botIn = true) {
  const calls = { fetchGuilds: 0, botInGuild: 0 };
  let next: DiscordGuild[] = [...guilds];
  let failure: Error | undefined;
  return {
    calls,
    failWith(error: Error) {
      failure = error;
    },
    succeedWith(rows: readonly DiscordGuild[]) {
      failure = undefined;
      next = [...rows];
    },
    async fetchGuilds(): Promise<DiscordGuild[]> {
      calls.fetchGuilds += 1;
      if (failure) throw failure;
      return [...next];
    },
    async botInGuild(): Promise<boolean> {
      calls.botInGuild += 1;
      return botIn;
    },
  };
}

describe("canManageGuild", () => {
  it("accepts the owner, Administrator and Manage Server, and nothing else", () => {
    expect(canManageGuild(guild("1", "0", true))).toBe(true);
    expect(canManageGuild(guild("1", OWNER.toString()))).toBe(true);
    expect(canManageGuild(guild("1", MANAGE.toString()))).toBe(true);
    expect(canManageGuild(guild("1", ((1n << 40n) | 0n).toString()))).toBe(false);
    expect(canManageGuild(guild("1", "not-a-number"))).toBe(false);
  });
});

describe("GuildAccessService", () => {
  it("filters the OAuth list to manageable guilds", async () => {
    const oauth = fakeOauth([guild("owned", "0", true), guild("managed", MANAGE.toString()), guild("member")]);
    const service = new GuildAccessService(oauth);
    expect((await service.manageableGuilds("token-a")).map((row) => row.id)).toEqual(["owned", "managed"]);
  });

  it("shares one Discord read across a burst and refetches after the window", async () => {
    let now = 1_000;
    const oauth = fakeOauth([guild("owned", "0", true)]);
    const service = new GuildAccessService(oauth, () => now, 30_000);

    const [first, second] = await Promise.all([
      service.manageableGuilds("token-a"),
      service.authorize("token-a", "owned"),
    ]);
    expect(first).toHaveLength(1);
    expect(second.id).toBe("owned");
    expect(oauth.calls.fetchGuilds).toBe(1);

    await service.manageableGuilds("token-a");
    expect(oauth.calls.fetchGuilds).toBe(1);

    now += 30_001;
    await service.manageableGuilds("token-a");
    expect(oauth.calls.fetchGuilds).toBe(2);
  });

  it("does not cache a failed read", async () => {
    const oauth = fakeOauth([guild("owned", "0", true)]);
    const service = new GuildAccessService(oauth);
    oauth.failWith(new Error("Discord request failed with HTTP 429."));
    await expect(service.manageableGuilds("token-a")).rejects.toThrow("429");

    oauth.succeedWith([guild("owned", "0", true)]);
    await expect(service.manageableGuilds("token-a")).resolves.toHaveLength(1);
    expect(oauth.calls.fetchGuilds).toBe(2);
  });

  it("keeps a cache per access token", async () => {
    const oauth = fakeOauth([guild("owned", "0", true)]);
    const service = new GuildAccessService(oauth);
    await service.manageableGuilds("token-a");
    await service.manageableGuilds("token-b");
    expect(oauth.calls.fetchGuilds).toBe(2);
  });

  it("refuses a guild the user cannot manage and checks the bot per guild", async () => {
    const oauth = fakeOauth([guild("owned", "0", true)]);
    const service = new GuildAccessService(oauth);
    await expect(service.authorize("token-a", "other")).rejects.toMatchObject({ status: 403 });

    const missingBot = new GuildAccessService(fakeOauth([guild("owned", "0", true)], false));
    await expect(missingBot.authorize("token-a", "owned")).rejects.toBeInstanceOf(HttpError);
    await expect(missingBot.authorize("token-a", "owned")).rejects.toMatchObject({ code: "bot_not_in_guild" });
  });
});
