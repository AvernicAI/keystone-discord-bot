import { ModuleRegistry, auditBudget, formatBudgetReport } from "@keystone/kernel";
import { modules } from "../apps/bot/src/modules";

const registry = new ModuleRegistry().registerAll(modules);
const report = auditBudget(registry);

console.log(formatBudgetReport(report));

if (report.status === "warn") {
  console.log(
    `\nWarning: ${report.commands} commands registered. At ${report.limit} Discord stops accepting new ones — consider a hub command or a subcommand group.`,
  );
}

if (report.status === "fail") {
  console.error("\nCommand budget exceeded. See memory/vault/03-Architecture/Command-Budget.md");
  process.exitCode = 1;
}
