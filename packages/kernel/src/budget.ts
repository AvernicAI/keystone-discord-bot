import type { ModuleRegistry, RegisteredCommand } from "./registry";

/**
 * Discord's hard limits, mirrored here so a PR that busts them fails in CI
 * rather than in production. Sources: docs.discord.com/developers/interactions/application-commands
 */
export const DISCORD_LIMITS = {
  /** Global chat-input commands per application. Our scarcest resource. */
  globalCommands: 100,
  optionsPerCommand: 25,
  /** Name + description + options, including the longest localisation. */
  commandPayloadChars: 8000,
  /** We want to hear about bloat long before we hit the wall. */
  warnAt: 80,
} as const;

export interface CommandMeasurement {
  name: string;
  moduleId: string;
  /** Direct subcommands plus subcommands inside groups. */
  subcommands: number;
  /** The largest option list on any single node, which is what Discord caps. */
  options: number;
  /** Serialised size of the command definition, as a proxy for Discord's payload cap. */
  payloadChars: number;
}

export type BudgetStatus = "ok" | "warn" | "fail";

export interface BudgetReport {
  commands: number;
  subcommands: number;
  actions: number;
  limit: number;
  remaining: number;
  warnAt: number;
  status: BudgetStatus;
  perCommand: readonly CommandMeasurement[];
  violations: string[];
}

function measure(registered: RegisteredCommand): CommandMeasurement {
  const { definition, moduleId } = registered;
  const subcommands = [
    ...(definition.subcommands ?? []),
    ...(definition.groups ?? []).flatMap((group) => group.subcommands),
  ];
  const payload = JSON.stringify({
    name: definition.name,
    description: definition.description,
    options: definition.options ?? [],
    subcommands: definition.subcommands ?? [],
    groups: definition.groups ?? [],
  });
  return {
    name: definition.name,
    moduleId,
    subcommands: subcommands.length,
    options: Math.max(
      definition.options?.length ?? 0,
      ...subcommands.map((subcommand) => subcommand.options?.length ?? 0),
    ),
    payloadChars: payload.length,
  };
}

/**
 * Pure form of the audit, so the hard limits can be tested without fabricating
 * a registry that has already rejected invalid input at manifest validation.
 */
export function auditMeasurements(perCommand: readonly CommandMeasurement[]): BudgetReport {
  const violations: string[] = [];

  for (const command of perCommand) {
    if (command.options > DISCORD_LIMITS.optionsPerCommand) {
      violations.push(`/${command.name} has ${command.options} options (max ${DISCORD_LIMITS.optionsPerCommand})`);
    }
    if (command.payloadChars > DISCORD_LIMITS.commandPayloadChars) {
      violations.push(
        `/${command.name} serialises to ${command.payloadChars} chars (max ${DISCORD_LIMITS.commandPayloadChars})`,
      );
    }
  }

  if (perCommand.length > DISCORD_LIMITS.globalCommands) {
    violations.push(
      `${perCommand.length} global commands registered (max ${DISCORD_LIMITS.globalCommands})`,
    );
  }

  const commands = perCommand.length;
  const subcommands = perCommand.reduce((sum, command) => sum + command.subcommands, 0);
  const status: BudgetStatus =
    violations.length > 0
      ? "fail"
      : commands >= DISCORD_LIMITS.warnAt
        ? "warn"
        : "ok";

  return {
    commands,
    subcommands,
    actions: commands + subcommands,
    limit: DISCORD_LIMITS.globalCommands,
    remaining: Math.max(0, DISCORD_LIMITS.globalCommands - commands),
    warnAt: DISCORD_LIMITS.warnAt,
    status,
    perCommand,
    violations,
  };
}

export function auditBudget(registry: ModuleRegistry): BudgetReport {
  return auditMeasurements(registry.listCommands().map(measure));
}

/** Human-readable ledger, printed by `pnpm budget` and at boot. */
export function formatBudgetReport(report: BudgetReport, sortByModule = true): string {
  const rows = [...report.perCommand].sort((a, b) =>
    sortByModule
      ? a.moduleId.localeCompare(b.moduleId) || a.name.localeCompare(b.name)
      : b.payloadChars - a.payloadChars,
  );
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length + 1));
  const moduleWidth = Math.max(6, ...rows.map((r) => r.moduleId.length));

  const lines = [
    "Command budget",
    `  ${report.commands}/${report.limit} global roots used (${report.remaining} left)`,
    `  ${report.subcommands} subcommands · ${report.actions} total actions`,
    `  status: ${report.status.toUpperCase()}`,
    "",
    `  ${"/command".padEnd(nameWidth)}  ${"module".padEnd(moduleWidth)}  subs  opts  chars`,
  ];

  for (const row of rows) {
    lines.push(
      `  ${`/${row.name}`.padEnd(nameWidth)}  ${row.moduleId.padEnd(moduleWidth)}  ${String(row.subcommands).padStart(4)}  ${String(row.options).padStart(4)}  ${String(row.payloadChars).padStart(5)}`,
    );
  }

  if (report.violations.length > 0) {
    lines.push("", "  Violations:");
    for (const violation of report.violations) lines.push(`  - ${violation}`);
  }

  return lines.join("\n");
}
