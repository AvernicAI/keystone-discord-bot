import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  requirePermissions,
  type CommandContext,
  type CommandOption,
} from "@keystone/kernel";
import { analyticsSettingsSchema } from "../settings";
import {
  commandsView,
  exportView,
  membersView,
  messagesView,
  overviewView,
  ticketsView,
  type AnalyticsView,
} from "../format";

const DAYS: CommandOption = {
  type: "integer",
  name: "days",
  description: "Window in days (1-90); defaults to the module setting or 7",
  minValue: 1,
  maxValue: 90,
};

const VIEWS: Record<string, (snapshot: Parameters<typeof overviewView>[0]) => AnalyticsView> = {
  overview: overviewView,
  members: membersView,
  messages: messagesView,
  commands: commandsView,
  tickets: ticketsView,
  export: exportView,
};

function optionDays(ctx: CommandContext): number | undefined {
  const value = ctx.interaction.options.days;
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

export const analytics = defineCommand({
  name: "analytics",
  description: "Read-only guild analytics from the bot's own logs, cases, invites, tickets and command usage.",
  subcommands: [
    { name: "overview", description: "One-page summary of the selected window.", options: [DAYS] },
    { name: "members", description: "Joins, leaves, invite attribution and retention.", options: [DAYS] },
    { name: "messages", description: "Logged message deletes, edits and content-filter cases.", options: [DAYS] },
    { name: "commands", description: "Command runs, outcomes and average latency.", options: [DAYS] },
    { name: "tickets", description: "Ticket counts, open state and close times.", options: [DAYS] },
    { name: "export", description: "Export the snapshot as JSON in an embed.", options: [DAYS] },
  ],
  guards: [requireGuild, requirePermissions("ManageGuild"), cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.analytics) {
      throw new UserError("Analytics is not wired in this process.");
    }
    const guildId = ctx.guildId as string;
    const settings = analyticsSettingsSchema.parse(await ctx.settings.get(guildId));
    if (!settings.enabled) {
      throw new UserError("Analytics is disabled in this server.");
    }

    const selected = ctx.commandPath[0] ?? "overview";
    const render = VIEWS[selected];
    if (!render) throw new UserError("Unknown analytics view.");

    const days = optionDays(ctx) ?? settings.defaultWindowDays;
    const until = new Date(ctx.now());
    const since = new Date(until.getTime() - days * 86_400_000);
    const snapshot = await ctx.analytics.snapshot(guildId, {
      days,
      since: since.toISOString(),
      until: until.toISOString(),
    });
    const view = render(snapshot);
    await ctx.interaction.reply({
      content: view.content,
      embeds: [view.embed],
      ephemeral: true,
    });
  },
  help: {
    category: "Operations",
    examples: [
      "/analytics overview",
      "/analytics members days:30",
      "/analytics commands days:7",
      "/analytics export days:30",
    ],
  },
  notes:
    "Every figure is an aggregate over rows the bot already stores; the Source rows field names each table and its row count. Message content is never included. Open tickets and active cases are current state, while the other counts use the selected window.",
});
