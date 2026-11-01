import {
  Events,
  type Client,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
} from "discord.js";
import type { Logger, LoggingPort, ModuleSettings } from "@keystone/kernel";
import { LoggingService } from "@keystone/module-logging";
import { botFixtureContent } from "./dev-fixture";

export interface LoggingEventOptions {
  /** Development-only guild where the MCP bot may drive message events with a marker. */
  readonly botTestGuildId?: string;
}

/**
 * Gateway → structural event translation. No policy lives here: the module
 * decides whether an event is enabled, stores it and renders the embed.
 *
 * MCP messages are bot-authored. In one development guild the shared
 * `keystone-test:` marker makes them testable; production passes no guild id,
 * so no bot message can widen that seam there.
 */
export function registerLoggingEvents(
  client: Client,
  port: LoggingPort,
  settings: ModuleSettings,
  logger: Logger,
  options: LoggingEventOptions = {},
): () => void {
  const service = new LoggingService(port.store, port.actions, settings);
  const report = (error: unknown): void => {
    logger.error("logging event failed", {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  };

  const markerContent = (
    raw: string,
    guildId: string,
    isBot: boolean,
  ): string | undefined =>
    botFixtureContent(
      { content: raw, guildId, author: { bot: isBot } },
      options.botTestGuildId,
    );

  const onDelete = (message: Message | PartialMessage): void => {
    if (!message.inGuild()) return;
    const raw = message.content ?? "";
    const isBot = Boolean(message.author?.bot);
    const fixture = markerContent(raw, message.guildId, isBot);
    if (isBot && fixture === undefined) return;

    void service
      .record({
        guildId: message.guildId,
        kind: "message_delete",
        actorId: message.author?.id,
        targetId: message.author?.id,
        channelId: message.channelId,
        messageId: message.id,
        summary: "Message deleted.",
        data: { content: (fixture ?? raw).slice(0, 1_000) },
        at: Date.now(),
      })
      .catch(report);
  };

  const onEdit = (
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
  ): void => {
    if (!newMessage.inGuild()) return;
    const author = newMessage.author ?? oldMessage.author;
    const isBot = Boolean(author?.bot);
    const beforeRaw = oldMessage.content ?? "";
    const afterRaw = newMessage.content ?? "";
    const before = markerContent(beforeRaw, newMessage.guildId, isBot);
    const after = markerContent(afterRaw, newMessage.guildId, isBot);
    if (isBot && before === undefined && after === undefined) return;

    void service
      .record({
        guildId: newMessage.guildId,
        kind: "message_edit",
        actorId: author?.id,
        targetId: author?.id,
        channelId: newMessage.channelId,
        messageId: newMessage.id,
        summary: "Message edited.",
        data: {
          before: (before ?? beforeRaw).slice(0, 1_000),
          after: (after ?? afterRaw).slice(0, 1_000),
        },
        at: Date.now(),
      })
      .catch(report);
  };

  const onJoin = (member: GuildMember): void => {
    void service
      .record({
        guildId: member.guild.id,
        kind: "member_join",
        actorId: member.id,
        targetId: member.id,
        summary: "Member joined.",
        data: {
          accountAgeDays: Math.max(
            0,
            Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000),
          ),
          bot: member.user.bot,
        },
        at: Date.now(),
      })
      .catch(report);
  };

  const onLeave = (member: GuildMember | PartialGuildMember): void => {
    void service
      .record({
        guildId: member.guild.id,
        kind: "member_leave",
        actorId: member.id,
        targetId: member.id,
        summary: "Member left.",
        data: {
          joinedAt: member.joinedAt?.toISOString() ?? "unknown",
        },
        at: Date.now(),
      })
      .catch(report);
  };

  client.on(Events.MessageDelete, onDelete);
  client.on(Events.MessageUpdate, onEdit);
  client.on(Events.GuildMemberAdd, onJoin);
  client.on(Events.GuildMemberRemove, onLeave);

  return () => {
    client.off(Events.MessageDelete, onDelete);
    client.off(Events.MessageUpdate, onEdit);
    client.off(Events.GuildMemberAdd, onJoin);
    client.off(Events.GuildMemberRemove, onLeave);
  };
}
