import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  requirePermissions,
  type CommandContext,
} from "@keystone/kernel";
import { caseListEmbed } from "../format";

/**
 * The user menu is the compact version of `/mod history user:@member`; it
 * reads the same case rows and adds no store. Case data can identify members,
 * so it uses the same `ModerateMembers` gate as the slash command.
 */
export const caseHistory = defineCommand({
  name: "Case history",
  description: "Show recent moderation cases for the selected member.",
  type: "user",
  guards: [requireGuild, requirePermissions("ModerateMembers"), cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.moderation) throw new UserError("Moderation services are not wired.");
    const target = ctx.interaction.targetId;
    if (!target) throw new UserError("That menu did not include a member.");
    const records = await ctx.moderation.cases.list(ctx.guildId as string, {
      targetId: target,
      limit: 10,
    });
    await ctx.interaction.reply({
      ephemeral: true,
      embeds: [caseListEmbed(records, `Cases for <@${target}>`)],
    });
  },
  help: {
    category: "Moderation",
    examples: ["Right-click a member → Apps → Case history"],
  },
  notes: "Read-only. The rows are the same cases `/mod case` and `/mod history` read.",
});
