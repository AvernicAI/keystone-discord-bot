import type { Client, TextChannel } from "discord.js";
import type { InviteActions, Logger } from "@keystone/kernel";
import { resolveChannel } from "./channels";

/**
 * The Discord side of invite alerts. One log message, no policy: whether a join
 * is suspicious is decided in `modules/invites`.
 */
export function createDiscordInviteActions(client: Client, logger: Logger): InviteActions {
  return {
    async notify(guildId, channelId, notice) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const resolved = await resolveChannel(() => guild.channels.fetch(channelId), channelId);
        if (resolved.status !== "ok") return;
        const channel = resolved.channel;
        if (!("send" in channel)) return;
        await (channel as TextChannel).send({
          content: notice.content,
          embeds: notice.embeds,
        });
      } catch (error) {
        // The join row is already durable; a bad log channel must not undo it.
        logger.warn("invite alert failed", {
          guild: guildId,
          channel: channelId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
