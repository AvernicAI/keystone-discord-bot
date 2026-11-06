import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
} from "@keystone/kernel";
import { casePanel } from "../format";

const EXCERPT_CHARS = 500;

/**
 * A message context menu is the one place a normal member can hand a message
 * to moderation without quoting it into a channel. It opens a real case; the
 * case stores the message id and a bounded excerpt, so a moderator can later
 * match the report to the message even when MessageContent is not granted.
 */
export const reportMessage = defineCommand({
  name: "Report message",
  description: "Open a moderation case for the selected message.",
  type: "message",
  guards: [requireGuild, cooldown(5_000)],
  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.moderation) throw new UserError("Moderation services are not wired.");
    const guildId = ctx.guildId as string;
    const messageId = ctx.interaction.targetId;
    const targetId = ctx.interaction.targetUserId;
    if (!messageId) throw new UserError("That menu did not include a message.");
    if (!targetId) throw new UserError("That message has no author to report.");
    if (targetId === ctx.userId) throw new UserError("You cannot report your own message.");

    const content = (ctx.interaction.targetContent ?? "").trim();
    const excerpt = content
      ? content.slice(0, EXCERPT_CHARS)
      : "(content unavailable; MessageContent intent is off)";
    const channelId = ctx.interaction.channelId ?? "unknown";

    const record = await ctx.moderation.cases.open({
      guildId,
      actorId: ctx.userId,
      targetId,
      action: "report",
      rule: "message-report",
      state: "open",
      reason: `Reported message in <#${channelId}>: ${excerpt}`.slice(0, 2_000),
      evidence: { messageId, channelId, excerpt },
    });

    await ctx.interaction.reply({
      ephemeral: true,
      v2: casePanel(record, {
        title: `Reported message · case #${record.caseNumber}`,
        context: `this server · reported by <@${ctx.userId}>`,
        readAt: ctx.now(),
        note: "Nothing was deleted or punished; a moderator reviews this case.",
      }),
    });
  },
  help: {
    category: "Moderation",
    examples: ["Right-click a message → Apps → Report message"],
  },
  notes:
    "A report creates a real case with the message id and a bounded excerpt. It never deletes or punishes; a moderator reviews it.",
});
