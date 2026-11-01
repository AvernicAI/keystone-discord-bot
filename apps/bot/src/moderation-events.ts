import { AuditLogEvent, Events, type Client } from "discord.js";
import type { Logger } from "@keystone/kernel";
import type { SecurityCoordinator } from "@keystone/module-moderation";

const AUDIT_ACTIONS: Partial<Record<AuditLogEvent, "channel.delete" | "role.delete" | "ban.add" | "webhook.create">> = {
  [AuditLogEvent.ChannelDelete]: "channel.delete",
  [AuditLogEvent.RoleDelete]: "role.delete",
  [AuditLogEvent.MemberBanAdd]: "ban.add",
  [AuditLogEvent.WebhookCreate]: "webhook.create",
};

/**
 * The gateway half of security. It does no policy: it translates discord.js
 * objects into structural events and hands them to the coordinator. That keeps
 * the scripted-raid test and production on the same decision path.
 */
export function registerModerationEvents(
  client: Client,
  coordinator: SecurityCoordinator,
  logger: Logger,
): void {
  const report = (error: unknown): void => {
    logger.error("security event failed", {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  };

  client.on(Events.GuildMemberAdd, (member) => {
    if (member.user.bot) return;
    void coordinator
      .handle({
        type: "member.join",
        guildId: member.guild.id,
        userId: member.id,
        accountAgeDays: Math.max(0, (Date.now() - member.user.createdTimestamp) / 86_400_000),
        hasAvatar: member.user.avatar !== null,
        at: Date.now(),
      })
      .catch(report);
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.author.bot) return;
    void coordinator
      .handle({
        type: "message.create",
        guildId: message.guild.id,
        channelId: message.channelId,
        messageId: message.id,
        userId: message.author.id,
        content: message.content,
        isBot: message.author.bot,
        at: Date.now(),
      })
      .catch(report);
  });

  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    const mapped = AUDIT_ACTIONS[entry.action];
    if (!mapped || !entry.executorId || entry.executorId === client.user?.id) return;
    void coordinator
      .handle({
        type: "audit.action",
        guildId: guild.id,
        userId: entry.executorId,
        action: mapped,
        targetId: entry.targetId ?? undefined,
        at: Date.now(),
      })
      .catch(report);
  });
}
