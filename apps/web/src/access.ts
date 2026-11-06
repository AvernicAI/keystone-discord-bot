import { createHash } from "node:crypto";
import { HttpError } from "./http-error";
import type { DiscordGuild, DiscordOAuth } from "./oauth";

/** Discord permission bits. BigInt is mandatory: bit 40 is MODERATE_MEMBERS. */
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

export function canManageGuild(guild: Pick<DiscordGuild, "owner" | "permissions">): boolean {
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions);
    return (permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

/** A burst of page loads and redirects must not spend one Discord call each. */
const GUILD_CACHE_MS = 30_000;

interface CachedGuilds {
  readonly expiresAt: number;
  readonly guilds: Promise<readonly DiscordGuild[]>;
}

/**
 * Two checks, not one:
 * 1. the OAuth user may manage this guild;
 * 2. the bot is actually in the guild.
 *
 * The OAuth guild list is cached for 30 seconds per access token (keyed by a
 * hash, never the token itself) and an in-flight read is shared. Discord rate
 * limits `/users/@me/guilds` per user, and a save-then-redirect sequence used to
 * turn that limit into a 500 on a page the operator had just been sent to. A
 * failed read is never cached. Thirty seconds is the freshness trade: a revoked
 * manager can read for at most that long, while every write still revalidates
 * against this same list. The bot-membership check is not cached, because it is
 * one cheap guild read and the security-relevant half.
 */
export class GuildAccessService {
  private readonly cache = new Map<string, CachedGuilds>();

  constructor(
    private readonly oauth: Pick<DiscordOAuth, "fetchGuilds" | "botInGuild">,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = GUILD_CACHE_MS,
  ) {}

  private cachedGuilds(accessToken: string): Promise<readonly DiscordGuild[]> {
    const key = createHash("sha256").update(accessToken).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.guilds;
    const guilds = this.oauth.fetchGuilds(accessToken).catch((error: unknown) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { expiresAt: this.now() + this.ttlMs, guilds });
    return guilds;
  }

  async manageableGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const guilds = await this.cachedGuilds(accessToken);
    return [...guilds].filter(canManageGuild);
  }

  /**
   * Authorize every selected guild with the same two checks as one guild.
   *
   * A fleet action must not trust the ids in the request: the OAuth guild list
   * is fetched once, every id is looked up in it, and bot membership is checked
   * per guild. This is the one place a multi-guild selection is authorized.
   */
  async authorizeMany(accessToken: string, guildIds: readonly string[]): Promise<DiscordGuild[]> {
    const guilds = await this.cachedGuilds(accessToken);
    const selected: DiscordGuild[] = [];
    for (const guildId of guildIds) {
      const guild = guilds.find((candidate) => candidate.id === guildId);
      if (!guild || !canManageGuild(guild)) {
        throw new HttpError(403, "You do not have permission to manage that guild.", "guild_forbidden");
      }
      if (!(await this.oauth.botInGuild(guildId))) {
        throw new HttpError(403, "Keystone is not in that guild.", "bot_not_in_guild");
      }
      selected.push(guild);
    }
    return selected;
  }

  /** Bot membership only. Used by token auth, which has no OAuth user grant. */
  async botInGuild(guildId: string): Promise<boolean> {
    return this.oauth.botInGuild(guildId);
  }

  async authorize(accessToken: string, guildId: string): Promise<DiscordGuild> {
    const [guild] = await this.authorizeMany(accessToken, [guildId]);
    if (!guild) {
      throw new HttpError(403, "You do not have permission to manage that guild.", "guild_forbidden");
    }
    return guild;
  }
}
