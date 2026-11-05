import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  requirePermissions,
  type CommandContext,
  type CommandOption,
  type ExportPort,
  type ReplyFile,
} from "@keystone/kernel";

const USER = {
  type: "user",
  name: "user",
  description: "Member whose rows to export",
  required: true,
} as const;

const BUNDLE = {
  type: "attachment",
  name: "bundle",
  description: "A .json keystone.export bundle",
  required: true,
} as const;

const MODE: CommandOption = {
  type: "string",
  name: "mode",
  description: "replace restores everything; merge keeps cases and history",
  choices: [
    { name: "replace", value: "replace" },
    { name: "merge", value: "merge" },
  ],
};

const DRY_RUN = {
  type: "boolean",
  name: "dry_run",
  description: "Preview by default; set false to write",
} as const;

const CONFIRM = {
  type: "string",
  name: "confirm",
  description: "Type this server's id to confirm irreversible deletion",
  required: true,
} as const;

const IMPORT_ID = {
  type: "string",
  name: "import_id",
  description: "The id printed by /export import",
  required: true,
} as const;

function port(ctx: CommandContext): ExportPort {
  if (!ctx.export) throw new UserError("Export is not wired in this process.");
  return ctx.export;
}

function text(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(ctx: CommandContext, key: string): boolean | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "boolean" ? value : undefined;
}

function clip(value: string, max = 1_024): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const COUNT_LABELS: Record<string, string> = {
  settings: "settings",
  members: "members",
  cases: "cases",
  caseEvents: "case events",
  tickets: "tickets",
  forms: "forms",
  formSubmissions: "submissions",
  levels: "levels",
  xpEvents: "XP events",
  economyLedger: "ledger rows",
  communityRecords: "records",
  aiDocuments: "documents",
  aiUsage: "AI usage periods",
};

function countSummary(counts: Readonly<Record<string, number>>): string {
  const parts = Object.entries(counts)
    .filter(([key, value]) => value > 0 && COUNT_LABELS[key])
    .map(([key, value]) => `${value} ${COUNT_LABELS[key]}`);
  return parts.length > 0 ? parts.join(" · ") : "no rows in this scope";
}

function warningsField(warnings: readonly string[]): string {
  return warnings.length > 0 ? clip(warnings.join("\n")) : "None.";
}

function exportFile(result: {
  fileName: string;
  content: string;
  warnings: readonly string[];
}): ReplyFile {
  return {
    name: result.fileName,
    content: result.content,
    description: "Keystone export. Contains member ids and history; keep it private.",
  };
}

export const exportCommand = defineCommand({
  name: "export",
  description: "Export, inspect or restore this server's data without leaving Discord.",
  subcommands: [
    {
      name: "guild",
      description: "Download the full server bundle with settings, cases and history.",
    },
    {
      name: "user",
      description: "Download one member's cases, tickets, XP and ledger rows.",
      options: [USER],
    },
    {
      name: "import",
      description: "Preview or restore a keystone.export bundle attachment.",
      options: [BUNDLE, MODE, DRY_RUN],
    },
    {
      name: "delete",
      description: "Delete this server's stored data and leave a count-only receipt.",
      options: [CONFIRM],
    },
    {
      name: "drift",
      description: "Compare stored channel and role ids with the live server.",
    },
    {
      name: "rollback",
      description: "Restore the pre-import backup of an applied import.",
      options: [IMPORT_ID],
    },
  ],
  guards: [requireGuild, requirePermissions("ManageGuild"), cooldown(5_000)],
  async execute(ctx: CommandContext): Promise<void> {
    const guildId = ctx.guildId as string;
    const selected = ctx.commandPath[0];
    const exporter = port(ctx);

    if (selected === "guild") {
      const result = await exporter.guild(guildId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Guild export ready · ${countSummary(result.counts)} · checksum ${result.checksum.slice(0, 16)}…`,
        files: [exportFile(result)],
        embeds: [
          {
            title: "Guild export",
            description:
              "The attached JSON is the same verified `keystone.export` bundle the CLI writes. Verify the checksum before restoring it anywhere.",
            color: 0x5865f2,
            fields: [
              { name: "Rows", value: clip(countSummary(result.counts)), inline: false },
              { name: "Checksum", value: `\`${result.checksum}\``, inline: false },
              { name: "Warnings", value: warningsField(result.warnings), inline: false },
            ],
            footer: { text: "Contains member ids and moderation history. Treat it as private." },
          },
        ],
      });
      return;
    }

    if (selected === "user") {
      const userId = text(ctx, "user");
      if (!userId) throw new UserError("Choose a member with the `user` option.");
      const result = await exporter.user(guildId, userId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `User export ready · <@${result.userId}> · ${countSummary(result.counts)}`,
        files: [exportFile(result)],
        embeds: [
          {
            title: "Member export",
            description: "Only rows where this member is the target, actor, opener, claimer or owner are included.",
            color: 0x5865f2,
            fields: [
              { name: "Rows", value: clip(countSummary(result.counts)), inline: false },
              { name: "Warnings", value: warningsField(result.warnings), inline: false },
            ],
          },
        ],
      });
      return;
    }

    if (selected === "import") {
      const url = text(ctx, "bundle");
      if (!url) throw new UserError("Attach a keystone.export JSON file with the `bundle` option.");
      const reader = ctx.attachments;
      if (!reader) throw new UserError("Attachment reading is not wired in this process.");
      const mode = text(ctx, "mode") === "merge" ? "merge" : "replace";
      const dryRun = optionalBoolean(ctx, "dry_run") ?? true;
      const bundleText = await reader.read(url);
      const result = await exporter.importBundle(guildId, bundleText, {
        mode,
        dryRun,
        actorId: ctx.userId,
      });
      const diff = result.diff
        ? `${result.diff.added} added · ${result.diff.changed} changed · ${result.diff.removed} removed`
        : "no setting diff";
      await ctx.interaction.reply({
        ephemeral: true,
        content:
          result.state === "dry-run"
            ? `Import preview · ${mode} · ${diff} · nothing written.`
            : `Import applied · ${mode} · ${diff} · verified ${result.verified === true ? "yes" : "NO"}${result.importId ? ` · id \`${result.importId}\`` : ""}`,
        embeds: [
          {
            title: result.state === "dry-run" ? "Import preview (dry run)" : "Import applied",
            description:
              result.state === "dry-run"
                ? "Nothing was written. Re-run with `dry_run:false` after reviewing the counts and diff."
                : "The pre-import snapshot is stored for 24 hours. Use `/export rollback import_id:<id>` to undo this import.",
            color: result.verified === false ? 0xed4245 : result.state === "dry-run" ? 0xfee75c : 0x57f287,
            fields: [
              { name: "Counts", value: clip(countSummary(result.counts ?? {})), inline: false },
              { name: "Diff", value: clip(diff), inline: false },
              { name: "Warnings", value: warningsField(result.warnings), inline: false },
            ],
          },
        ],
      });
      return;
    }

    if (selected === "delete") {
      const confirm = text(ctx, "confirm");
      if (confirm !== guildId) {
        throw new UserError(`Refusing to delete. Type this server's id (\`${guildId}\`) in \`confirm\` to continue.`);
      }
      const result = await exporter.deleteGuild(guildId, ctx.userId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Server data deleted · ${countSummary(result.counts)} · receipt \`${result.importId}\``,
        embeds: [
          {
            title: "Deletion receipt",
            description:
              "Every guild-scoped row and backup was removed in one transaction. The receipt keeps counts and a content hash, not the deleted content.",
            color: 0xed4245,
            fields: [
              { name: "Rows removed", value: clip(countSummary(result.counts)), inline: false },
              { name: "Content hash", value: `\`${result.checksum}\``, inline: false },
              { name: "Deleted at", value: result.deletedAt, inline: false },
            ],
          },
        ],
      });
      return;
    }

    if (selected === "drift") {
      if (!ctx.exportFacts) throw new UserError("Live guild facts are not wired in this process.");
      const live = await ctx.exportFacts(guildId);
      const report = await exporter.drift(guildId, live);
      const missing = report.missing
        .slice(0, 10)
        .map((gap) => `\`${gap.id}\` · ${gap.path}`)
        .join("\n");
      const permissions = report.permissionGaps
        .slice(0, 10)
        .map((gap) => `<#${gap.channelId}> · ${gap.permission} · ${gap.path}`)
        .join("\n");
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Drift report · ${report.refs} configured reference${report.refs === 1 ? "" : "s"} · ${report.missing.length} missing · read-only`,
        embeds: [
          {
            title: "Drift report",
            description:
              "Missing may mean deleted **or** hidden from the bot after channel obfuscation. Fix the setting or the permission, never both blindly.",
            color: report.missing.length > 0 ? 0xfee75c : 0x57f287,
            fields: [
              { name: "Missing resources", value: missing || "None.", inline: false },
              { name: "Permission gaps", value: permissions || "None supplied.", inline: false },
              {
                name: "AutoMod rules",
                value:
                  report.missingAutoModRules.length > 0
                    ? clip(report.missingAutoModRules.join(", "))
                    : "None expected or all present.",
                inline: false,
              },
            ],
            footer: { text: "This command never writes or repairs a setting." },
          },
        ],
      });
      return;
    }

    if (selected === "rollback") {
      const importId = text(ctx, "import_id");
      if (!importId) throw new UserError("Provide the import id printed by `/export import`.");
      const result = await exporter.rollback(importId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Rollback complete · import \`${result.importId}\` · state ${result.state}`,
        embeds: [
          {
            title: "Import rolled back",
            description:
              "The pre-import snapshot was restored through the same transactional replace. There is no undo-an-undo; export again if you need to move forward.",
            color: 0x57f287,
            fields: [
              { name: "Guild", value: result.guildId, inline: true },
              { name: "State", value: result.state, inline: true },
              { name: "Rolled back at", value: result.rolledBackAt ?? "unknown", inline: false },
            ],
          },
        ],
      });
      return;
    }

    throw new UserError("Unknown export action. Use `/export guild`.");
  },
  help: {
    category: "Operations",
    permissions: ["ManageGuild"],
    examples: [
      "/export guild",
      "/export user user:@member",
      "/export import bundle:<file> dry_run:true",
      "/export drift",
      "/export rollback import_id:<uuid>",
    ],
  },
  notes:
    "`/export guild` and `/export user` attach a JSON file. `import` defaults to a preview; `delete` requires the exact server id. The SQL adapter is the same PortabilityService the CLI uses, so there is one restore policy.",
});
