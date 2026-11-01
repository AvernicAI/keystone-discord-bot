import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
} from "@keystone/kernel";
import { InviteService } from "../invites";
import { inviteSettingsSchema } from "../settings";

function option(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const invites = defineCommand({
  name: "invites",
  description: "Invite leaderboard, your invite stats, and who invited a member.",
  subcommands: [
    { name: "leaderboard", description: "Show who has brought the most members in.", options: [
      { type: "integer", name: "limit", description: "Leaderboard rows", minValue: 1, maxValue: 25 },
    ] },
    { name: "stats", description: "Show a member's join and retention totals.", options: [
      { type: "user", name: "user", description: "Member to inspect (defaults to you)" },
    ] },
    { name: "who", description: "Show who invited a member and any advisory flags.", options: [
      { type: "user", name: "user", description: "Member to inspect (defaults to you)" },
    ] },
  ],
  guards: [requireGuild, cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.invites) throw new UserError("Invite tracking is not wired.");
    const guildId = ctx.guildId as string;
    const settings = inviteSettingsSchema.parse(await ctx.settings.get(guildId));
    const service = new InviteService(
      ctx.invites.store,
      ctx.invites.actions,
      settings,
      ctx.now,
    );
    const selected = ctx.commandPath[0] ?? option(ctx, "action");

    if (selected === "leaderboard") {
      const limit = typeof ctx.interaction.options.limit === "number"
        ? ctx.interaction.options.limit
        : undefined;
      const rows = await service.leaderboard(guildId, limit);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "Invite leaderboard",
            description:
              rows.length === 0
                ? "No invites recorded yet. Create an invite, then have someone join."
                : rows
                    .map(
                      (row, index) =>
                        `${index + 1}. <@${row.inviterId}> — ${row.joins} joined · ${row.retained} retained`,
                    )
                    .join("\n"),
            color: 0x5865f2,
            footer: { text: "Only invites redeemed while Keystone was tracking are counted." },
          },
        ],
      });
      return;
    }

    if (selected === "stats") {
      const target = option(ctx, "user") ?? ctx.userId;
      const stats = await service.statsFor(guildId, target);
      await ctx.interaction.reply({
        embeds: [
          {
            title: `Invites for <@${target}>`,
            description: stats
              ? `**${stats.joins}** joined · **${stats.retained}** still in the server`
              : "No invite attributions recorded for that member yet.",
            color: 0x5865f2,
          },
        ],
      });
      return;
    }

    const target = option(ctx, "user") ?? ctx.userId;
    const join = await service.invitee(guildId, target);
    if (!join?.inviterId) {
      await ctx.interaction.reply({
        content: `No invite attribution is recorded for <@${target}>.`,
        ephemeral: true,
      });
      return;
    }

    const flags = join.fakeReasons.length > 0
      ? `\nFlagged: ${join.fakeReasons.join(", ")}`
      : "";
    await ctx.interaction.reply({
      content: `<@${target}> was invited by <@${join.inviterId}> with code \`${join.code ?? "unknown"}\`.${flags}`,
      ephemeral: true,
    });
  },
  notes:
    "Read-only and public. Attribution depends on the GuildMembers intent and the bot's ManageGuild permission to list invites.",
});
