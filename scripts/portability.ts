import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "@keystone/config";
import { createPortabilityStore, createPostgresDatabase } from "@keystone/db";
import {
  PortabilityService,
  parseBundle,
  parseLevelsFile,
  parseTranscriptFile,
  serializeBundle,
  type LevelApplyMode,
  type LiveGuildFacts,
} from "@keystone/importer";

/**
 * The operator surface for P5. It is a CLI on purpose: restoring a guild is a
 * deliberate, audited action, not a slash command a moderator can fire by
 * accident, and the dashboard does not exist yet.
 */
const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  if (!command) usage();

  const env = loadEnv();
  if (!env.DATABASE_URL) {
    fail("DATABASE_URL is required. Run docker compose up -d postgres, then try again.");
  }
  const database = createPostgresDatabase(env.DATABASE_URL);
  const service = new PortabilityService(createPortabilityStore(database));

  try {
    switch (command) {
      case "export":
        await exportBundle(service, args);
        break;
      case "import":
        await importBundle(service, args);
        break;
      case "levels":
        await importLevels(service, args);
        break;
      case "transcript":
        await importTranscript(service, args);
        break;
      case "rollback":
        await rollback(service, args);
        break;
      case "delete":
        await deleteGuild(service, args);
        break;
      case "drift":
        await drift(service, args);
        break;
      default:
        usage();
    }
  } finally {
    await database.close();
  }
}

async function exportBundle(service: PortabilityService, args: string[]): Promise<void> {
  const [guildId, output] = args;
  if (!guildId || !output) fail("Usage: pnpm portability export <guildId> <bundle.json>");
  const bundle = await service.exportGuild(guildId);
  const target = path.resolve(output);
  await writeFile(target, serializeBundle(bundle), { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        wrote: target,
        guildId,
        checksum: bundle.manifest.checksum,
        counts: bundle.manifest.counts,
        note: "The bundle contains member ids and moderation history. Keep it private.",
      },
      null,
      2,
    ),
  );
}

async function importBundle(service: PortabilityService, args: string[]): Promise<void> {
  const [file, guildId] = args;
  if (!file || !guildId) {
    fail("Usage: pnpm portability import <bundle.json> <guildId> [--mode replace|merge] [--dry-run] [--yes]");
  }
  const flags = flagsFor(args.slice(2));
  const mode = (flags.mode ?? "replace") as "replace" | "merge";
  if (!["replace", "merge"].includes(mode)) fail("--mode must be replace or merge");
  const dryRun = Boolean(flags["dry-run"]);
  if (!dryRun && !flags.yes) fail("Refusing to restore without --yes (or pass --dry-run first).");

  const bundle = parseBundle(await readFile(path.resolve(file), "utf8"));
  const outcome = await service.importBundle(bundle, guildId, {
    mode,
    levelMode: (flags.levels as LevelApplyMode | undefined) ?? "keep-higher",
    dryRun,
    actorId: process.env.USER ?? "cli",
  });
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.state === "applied" && outcome.receipt.verified === false) {
    process.exitCode = 1;
  }
}

async function importLevels(service: PortabilityService, args: string[]): Promise<void> {
  const [file, guildId] = args;
  if (!file || !guildId) {
    fail("Usage: pnpm portability levels <file.json|csv> <guildId> [--mode replace|keep-higher|add-on-top] [--dry-run] [--yes]");
  }
  const flags = flagsFor(args.slice(2));
  const mode = (flags.mode ?? "keep-higher") as LevelApplyMode;
  if (!["replace", "keep-higher", "add-on-top"].includes(mode)) {
    fail("--mode must be replace, keep-higher or add-on-top");
  }
  const dryRun = Boolean(flags["dry-run"]);
  if (!dryRun && !flags.yes) fail("Refusing to write levels without --yes (or pass --dry-run first).");

  const imported = parseLevelsFile({
    filename: file,
    content: await readFile(path.resolve(file), "utf8"),
  });
  const outcome = await service.importLevels(imported, guildId, {
    mode,
    dryRun,
    actorId: process.env.USER ?? "cli",
  });
  console.log(JSON.stringify(outcome, null, 2));
}

async function importTranscript(service: PortabilityService, args: string[]): Promise<void> {
  const [file, guildId] = args;
  if (!file || !guildId) fail("Usage: pnpm portability transcript <file.json|html> <guildId>");
  const transcript = parseTranscriptFile({
    filename: file,
    content: await readFile(path.resolve(file), "utf8"),
  });
  const key = await service.archiveTranscript(guildId, transcript, process.env.USER ?? "cli");
  console.log(JSON.stringify({ stored: key, ...transcript }, null, 2));
}

async function rollback(service: PortabilityService, args: string[]): Promise<void> {
  const [importId] = args;
  if (!importId) fail("Usage: pnpm portability rollback <importId>");
  console.log(JSON.stringify(await service.rollback(importId), null, 2));
}

async function deleteGuild(service: PortabilityService, args: string[]): Promise<void> {
  const [guildId] = args;
  if (!guildId) fail("Usage: pnpm portability delete <guildId> --yes");
  const flags = flagsFor(args.slice(1));
  if (!flags.yes) {
    fail("Refusing to delete a guild's data without --yes. This cannot be undone; export first.");
  }
  const result = await service.deleteGuild(guildId, process.env.USER ?? "cli");
  console.log(JSON.stringify(result, null, 2));
}

async function drift(service: PortabilityService, args: string[]): Promise<void> {
  const [guildId, liveFile] = args;
  if (!guildId || !liveFile) fail("Usage: pnpm portability drift <guildId> <live.json>");
  const live = JSON.parse(await readFile(path.resolve(liveFile), "utf8")) as LiveGuildFacts;
  for (const field of ["channels", "roles", "categories", "automodRules"] as const) {
    if (!Array.isArray(live[field])) fail(`live.json is missing the \`${field}\` array.`);
  }
  console.log(JSON.stringify(await service.drift(guildId, live), null, 2));
}

function flagsFor(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function usage(): never {
  console.error(`Keystone portability

  pnpm portability export <guildId> <bundle.json>
  pnpm portability import <bundle.json> <guildId> [--mode replace|merge] [--dry-run] [--yes]
  pnpm portability levels <file.json|csv> <guildId> [--mode replace|keep-higher|add-on-top] [--dry-run] [--yes]
  pnpm portability transcript <file.json|html> <guildId>
  pnpm portability rollback <importId>
  pnpm portability delete <guildId> --yes
  pnpm portability drift <guildId> <live.json>

Destructive actions require --yes. Import is dry-run first by habit; run the
preview, read the receipt, then restore.`);
  process.exit(1);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
