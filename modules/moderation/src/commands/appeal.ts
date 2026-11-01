import { UserError, defineCommand, requireGuild, type CommandContext } from "@keystone/kernel";
import { caseEmbed } from "../format";
import { moderationSettingsSchema } from "../settings";

function integerOption(ctx: CommandContext, name: string): number | undefined {
  const value = ctx.interaction.options[name];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export const appeal = defineCommand({
  name: "appeal",
  description: "Appeal a moderation case against you.",
  guards: [requireGuild],
  options: [
    { type: "integer", name: "case", description: "Case number to appeal", required: true },
    { type: "string", name: "message", description: "Why the case should be reviewed" },
  ],
  async execute(ctx) {
    if (!ctx.moderation) {
      throw new UserError("Moderation is not configured. Run /setup to check the database.");
    }
    const guildId = ctx.guildId!;
    const settings = moderationSettingsSchema.parse(await ctx.settings.get(guildId));
    if (!settings.appealsEnabled) {
      throw new UserError("Appeals are disabled in this server.");
    }
    const caseNumber = integerOption(ctx, "case");
    if (!caseNumber) throw new UserError("Provide the case number you want to appeal.");

    const record = await ctx.moderation.cases.appealByNumber(
      guildId,
      caseNumber,
      ctx.userId,
      typeof ctx.interaction.options.message === "string"
        ? ctx.interaction.options.message
        : "",
    );

    await ctx.interaction.reply({
      ephemeral: true,
      embeds: [
        caseEmbed(record, `Appeal opened · case #${record.caseNumber}`),
      ],
      content: "A moderator can now review the appeal in `/mod review`. Nothing was reversed automatically.",
    });
  },
  notes:
    "Appeals are additive events, never edits. The original action and reason stay visible even if the case is later reversed.",
});
