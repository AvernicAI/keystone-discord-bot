import { UserError, defineCommand, requireGuild } from "@keystone/kernel";
import { moderationSettingsSchema } from "../settings";

export const verify = defineCommand({
  name: "verify",
  description: "Complete the join gate and leave quarantine.",
  guards: [requireGuild],
  async execute(ctx) {
    if (!ctx.moderation) {
      throw new UserError("Moderation is not configured. Run /setup to check the database.");
    }
    const guildId = ctx.guildId!;
    const settings = moderationSettingsSchema.parse(await ctx.settings.get(guildId));
    if (!settings.joinGate.enabled) {
      throw new UserError("The join gate is not enabled in this server.");
    }

    const result = await ctx.moderation.actions.unquarantine(
      guildId,
      ctx.userId,
      "Verification completed",
      settings.quarantineRoleId,
    );
    if (!result.ok) {
      throw new UserError(
        `Could not verify you: ${result.detail ?? "check that the bot can manage the quarantine role"}`,
      );
    }
    await ctx.interaction.reply({
      content: "Verified. Quarantine has been lifted; welcome in.",
      ephemeral: true,
    });
  },
  notes:
    "A command fallback for the verification button. Both paths call the same unquarantine action, so a deployment without components still has a way through the gate.",
});
