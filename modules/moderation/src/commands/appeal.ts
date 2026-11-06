import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CaseServicePort,
  type CommandContext,
  type ModerationCase,
} from "@keystone/kernel";
import { appealStatusPanel, casePanel, type AppealStatusEntry } from "../format";
import { moderationSettingsSchema } from "../settings";

function integerOption(ctx: CommandContext, name: string): number | undefined {
  const value = ctx.interaction.options[name];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function textOption(ctx: CommandContext, name: string): string | undefined {
  const value = ctx.interaction.options[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireCases(ctx: CommandContext): CaseServicePort {
  if (!ctx.moderation) {
    throw new UserError("Moderation is not configured. Run /setup to check the database.");
  }
  return ctx.moderation.cases;
}

async function openAppeal(ctx: CommandContext): Promise<void> {
  const cases = requireCases(ctx);
  const guildId = ctx.guildId!;
  const settings = moderationSettingsSchema.parse(await ctx.settings.get(guildId));
  if (!settings.appealsEnabled) {
    throw new UserError("Appeals are disabled in this server.");
  }
  const caseNumber = integerOption(ctx, "case");
  if (!caseNumber) throw new UserError("Provide the case number you want to appeal.");

  const record = await cases.appealByNumber(
    guildId,
    caseNumber,
    ctx.userId,
    textOption(ctx, "message") ?? "",
  );

  await ctx.interaction.reply({
    ephemeral: true,
    v2: casePanel(record, {
      title: `Appeal opened · case #${record.caseNumber}`,
      readAt: ctx.now(),
      note: "A moderator can now review the appeal in `/mod review`. Nothing was reversed automatically.",
    }),
  });
}

async function appealFor(
  cases: CaseServicePort,
  record: ModerationCase,
): Promise<AppealStatusEntry> {
  const events = await cases.listEvents(record.id);
  return {
    record,
    appeals: events.filter((event) => event.type === "appealed"),
  };
}

async function statusAppeal(ctx: CommandContext): Promise<void> {
  const cases = requireCases(ctx);
  const guildId = ctx.guildId!;
  const requested = integerOption(ctx, "case");
  const records = await cases.list(guildId, { targetId: ctx.userId, limit: 25 });

  if (requested !== undefined) {
    const record = records.find((entry) => entry.caseNumber === requested);
    if (!record) {
      throw new UserError(`Case #${requested} is not one of your cases.`);
    }
    const entry = await appealFor(cases, record);
    await ctx.interaction.reply({
      ephemeral: true,
      v2: appealStatusPanel([entry], `Appeal status · case #${requested}`, {
        readAt: ctx.now(),
      }),
    });
    return;
  }

  const entries: AppealStatusEntry[] = [];
  for (const record of records.slice(0, 10)) {
    const entry = await appealFor(cases, record);
    if (entry.appeals.length > 0) entries.push(entry);
  }

  await ctx.interaction.reply({
    ephemeral: true,
    v2: appealStatusPanel(entries, "Your appeals", { readAt: ctx.now() }),
  });
}

/**
 * `/appeal` is the member's door into the case file. `open` appends an appeal
 * event; `status` reads the append-only events back. Discord requires one of
 * the two subcommands, so there is no optionless root that could guess wrong.
 */
export const appeal = defineCommand({
  name: "appeal",
  description: "Appeal a case against you, or check an appeal's status.",
  guards: [requireGuild, cooldown(5_000)],
  subcommands: [
    {
      name: "open",
      description: "Appeal a moderation case against you.",
      options: [
        { type: "integer", name: "case", description: "Case number to appeal", required: true },
        { type: "string", name: "message", description: "Why the case should be reviewed" },
      ],
    },
    {
      name: "status",
      description: "Read your appeal events and the current case states.",
      options: [
        {
          type: "integer",
          name: "case",
          description: "Show one case instead of your recent appeals",
        },
      ],
    },
  ],
  async execute(ctx) {
    const selected = ctx.commandPath[0];
    if (selected === "open") {
      await openAppeal(ctx);
      return;
    }
    if (selected === "status") {
      await statusAppeal(ctx);
      return;
    }
    throw new UserError("Choose `/appeal open` or `/appeal status`.");
  },
  notes:
    "Appeals are additive events, never edits. `status` reads the `appealed` events directly, so it still reports an appeal after a moderator changes the case state. The original action and reason stay visible even if the case is later reversed.",
});
