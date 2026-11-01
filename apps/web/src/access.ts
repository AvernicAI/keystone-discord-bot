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

/**
 * Two checks, not one:
 * 1. the OAuth user may manage this guild;
 * 2. the bot is actually in the guild.
 *
 * The guild list is fetched fresh on each request, so a demotion or a guild
 * removal takes effect immediately. A browser-held permission cache is never
 * trusted.
 */
export class GuildAccessService {
  constructor(
    private readonly oauth: Pick<DiscordOAuth, "fetchGuilds" | "botInGuild">,
  ) {}

  async manageableGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const guilds = await this.oauth.fetchGuilds(accessToken);
    return guilds.filter(canManageGuild);
  }

  async authorize(accessToken: string, guildId: string): Promise<DiscordGuild> {
    const guilds = await this.oauth.fetchGuilds(accessToken);
    const guild = guilds.find((candidate) => candidate.id === guildId);
    if (!guild || !canManageGuild(guild)) {
      throw new HttpError(403, "You do not have permission to manage that guild.", "guild_forbidden");
    }
    if (!(await this.oauth.botInGuild(guildId))) {
      throw new HttpError(403, "Keystone is not in that guild.", "bot_not_in_guild");
    }
    return guild;
  }
}
