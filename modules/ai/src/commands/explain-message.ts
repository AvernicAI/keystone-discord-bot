import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  requirePermissions,
  type CommandContext,
} from "@keystone/kernel";
import { replyAnswer } from "./ai";

/**
 * Message context menus can hand the AI a concrete message without copying
 * it into a slash option. The answer is advisory and comes from the same
 * `AiService.explain` path as `/ai explain`, so the `explanations` setting,
 * hard caps and zero-retention policy all still apply.
 */
export const explainMessage = defineCommand({
  name: "Explain with AI",
  description: "Explain why the selected message may be a moderation concern.",
  type: "message",
  guards: [requireGuild, requirePermissions("ManageMessages"), cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.ai) throw new UserError("AI services are not wired.");
    const guildId = ctx.guildId as string;
    const messageId = ctx.interaction.targetId;
    if (!messageId) throw new UserError("That menu did not include a message.");

    const content = (ctx.interaction.targetContent ?? "").trim();
    const facts = [
      `Message ${messageId} in channel ${ctx.interaction.channelId ?? "unknown"}`,
      `Author: ${ctx.interaction.targetUserId ?? "unknown"}`,
      `Content: ${content || "(content unavailable; MessageContent intent is off)"}`,
    ].join("\n");

    await replyAnswer(
      ctx,
      await ctx.ai.explain(guildId, facts),
      "Message explanation (advisory)",
    );
  },
  help: {
    category: "AI",
    examples: ["Right-click a message → Apps → Explain with AI"],
  },
  notes:
    "Advisory only: it explains, never punishes, deletes or claims an action happened. Disabled unless `ai.explanations` is on.",
});
