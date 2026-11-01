import { ModuleRegistry } from "@keystone/kernel";
import { modules } from "../apps/bot/src/modules";

/**
 * Static intent gate. It does not contact Discord; it proves that every module
 * declares Guilds and that every optional intent has a named fallback. The live
 * question — whether the app actually has the intent enabled — is a login
 * concern and produces close code 4014.
 */
const registry = new ModuleRegistry().registerAll(modules);
const failures: string[] = [];

for (const mod of registry.listModules()) {
  if (!(mod.intents ?? []).includes("Guilds")) {
    failures.push(`module "${mod.id}" does not declare the required Guilds intent`);
  }
}

const full = registry.capabilityReport("full");
const minimal = registry.capabilityReport("minimal");

for (const intent of registry.optionalIntents()) {
  const capability = minimal.intents.find((entry) => entry.name === intent);
  if (!capability?.fallback) {
    failures.push(`optional intent "${intent}" has no intentFallbacks description`);
  }
}

const line = (label: string, value: string) => console.log(`  ${label.padEnd(10)} ${value}`);

console.log("Intent audit");
line("required", registry.intents().join(", ") || "(none)");
line("optional", registry.optionalIntents().join(", ") || "(none)");
line("full", registry.intentsForProfile("full").join(", "));
line("minimal", registry.intentsForProfile("minimal").join(", "));
console.log("\nDisabled under INTENT_PROFILE=minimal:");
if (minimal.disabledFeatures.length === 0) console.log("  (none)");
for (const feature of minimal.disabledFeatures) console.log(`  - ${feature}`);

if (failures.length > 0) {
  console.error("\nIntent audit failed:");
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.log(`\n${registry.listModules().length} modules, ${full.intents.length} declared intents: OK`);
