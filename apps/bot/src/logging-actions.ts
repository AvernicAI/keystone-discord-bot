import type { Client, TextChannel } from "discord.js";
import type { Logger, LoggingActions } from "@keystone/kernel";
import { resolveChannel } from "./channels";

/**
 * The Discord side of audit logging. It only delivers; whether an event is
 * enabled and what it says is decided in `modules/logging`.
 *
 * A failed delivery is returned, not thrown. The event is already durable, and
 * a deleted channel must not turn a gateway listener into an error loop.
 */
export function createDiscordLoggingActions(
  client: Client,
  logger: Logger,
): LoggingActions {
  return {
    async send(guildId, channelId, notice) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const resolved = await resolveChannel(
          () => guild.channels.fetch(channelId),
          channelId,
        );
        if (resolved.status !== "ok") {
          return { ok: false, detail: resolved.reason };
        }

        const channel = resolved.channel;
        if (!channel.isTextBased() || !("send" in channel)) {
          return { ok: false, detail: "That channel cannot receive messages." };
        }

        await (channel as TextChannel).send({
          content: notice.content,
          embeds: notice.embeds as never,
          allowedMentions: { parse: [] },
        });
        return { ok: true };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn("logging delivery failed", {
          guild: guildId,
          channel: channelId,
          error: detail,
        });
        return { ok: false, detail };
      }
    },
  };
}
