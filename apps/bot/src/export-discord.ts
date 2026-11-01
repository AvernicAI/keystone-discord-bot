import { ChannelType, type Client, type Guild } from "discord.js";
import {
  UserError,
  type AttachmentReader,
  type ExportFacts,
  type ExportLiveFacts,
} from "@keystone/kernel";
import { cachedChannels } from "./channels";

const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;

/**
 * Live drift facts come from the gateway cache, not a hand-written JSON file.
 * A channel missing from this cache is exactly what an operator needs to see:
 * it may be deleted or hidden from the bot after obfuscation.
 */
export function createDiscordExportFacts(client: Client): ExportFacts {
  return async (guildId: string): Promise<ExportLiveFacts> => {
    const guild = await fetchGuild(client, guildId);
    const channels = cachedChannels(guild);
    let automodRules: string[] = [];
    try {
      const rules = await guild.autoModerationRules.fetch();
      automodRules = [...rules.values()].map((rule) => rule.name);
    } catch {
      // Reading AutoMod needs ManageGuild. The rest of the report is still
      // useful, and an empty list is reported as "not visible", not "no drift".
      automodRules = [];
    }

    return {
      channels: channels
        .filter((channel) => channel.type !== ChannelType.GuildCategory)
        .map((channel) => channel.id),
      categories: channels
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((channel) => channel.id),
      roles: [...guild.roles.cache.keys()],
      automodRules,
    };
  };
}

async function fetchGuild(client: Client, guildId: string): Promise<Guild> {
  const cached = client.guilds.cache.get(guildId);
  if (cached) return cached;
  try {
    return await client.guilds.fetch(guildId);
  } catch {
    throw new UserError(
      "The bot cannot see that guild. Add it to the server or check the bot's cache before running drift.",
    );
  }
}

/** Only Discord's own CDN is fetched; a bundle URL from chat is untrusted input. */
export function isDiscordAttachmentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net")
    );
  } catch {
    return false;
  }
}

/**
 * The import command receives a CDN URL, never an arbitrary URL. A 25 MB cap
 * is enforced before the parser sees the text, so a pasted link cannot exhaust
 * memory.
 */
export function createDiscordAttachmentReader(
  fetcher: typeof fetch = fetch,
): AttachmentReader {
  return {
    async read(url: string): Promise<string> {
      if (!isDiscordAttachmentUrl(url)) {
        throw new UserError("Attach the bundle file to the slash command; only Discord CDN URLs are accepted.");
      }

      let response: Response;
      try {
        response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
      } catch (error) {
        throw new UserError(
          `Could not download the bundle: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!response.ok) {
        throw new UserError(`Discord returned ${response.status} for the bundle attachment.`);
      }

      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_BUNDLE_BYTES) {
        throw new UserError(
          `The bundle is larger than ${MAX_BUNDLE_BYTES / 1024 / 1024} MB; use the CLI for a file that size.`,
        );
      }

      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_BUNDLE_BYTES) {
        throw new UserError(
          `The bundle is larger than ${MAX_BUNDLE_BYTES / 1024 / 1024} MB; use the CLI for a file that size.`,
        );
      }
      return text;
    },
  };
}
