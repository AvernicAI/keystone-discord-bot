import type { ZodTypeAny } from "zod";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOption,
  SubcommandDefinition,
} from "./types";

export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
/** Discord's own rule for slash-command and option names. */
export const COMMAND_NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u;

export interface ModuleManifest {
  /** Stable, unique, kebab-case. Used in settings keys, logs and docs paths. */
  id: string;
  name: string;
  description: string;
  version: string;
  /** Zod schema for this module's per-guild settings. */
  settingsSchema: ZodTypeAny;
  defaultSettings: Record<string, unknown>;
  commands: CommandDefinition[];
  /** Gateway intents this module needs, by discord.js name, e.g. "GuildMembers". */
  intents?: string[];
  /**
   * Privileged intents this module can use but does not require. A minimal
   * deployment boots without them and `/setup` names the lost features.
   */
  optionalIntents?: string[];
  /** Human-readable consequence of not requesting an optional intent. */
  intentFallbacks?: Record<string, string>;
  /** Discord permissions the module needs to do its job. */
  permissions?: string[];
  /** Where the teaching doc lives, relative to the vault root. */
  docsPath?: string;
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}

export function defineCommand(command: CommandDefinition): CommandDefinition {
  return command;
}

/**
 * Static validation of a manifest. Runs at registration (i.e. at boot and in
 * tests), so a bad contribution fails immediately with a readable message
 * instead of a 400 from Discord in production.
 */
export function validateManifest(manifest: ModuleManifest): string[] {
  const errors: string[] = [];

  if (!MODULE_ID_PATTERN.test(manifest.id)) {
    errors.push(`id "${manifest.id}" must be kebab-case, 2-32 chars, starting with a letter`);
  }
  if (!manifest.name.trim()) errors.push("name is required");
  if (!manifest.description.trim()) errors.push("description is required");
  if (!manifest.version.trim()) errors.push("version is required");

  const schema = manifest.settingsSchema as Partial<ZodTypeAny> | undefined;
  if (!schema || typeof schema.parse !== "function") {
    errors.push("settingsSchema must be a Zod schema");
  } else {
    const result = schema.safeParse?.(manifest.defaultSettings);
    if (result && !result.success) {
      errors.push(`defaultSettings do not satisfy settingsSchema: ${result.error.message}`);
    }
  }

  if (manifest.commands.length === 0) {
    errors.push("a module must declare at least one command (it may be a hub command)");
  }

  const intents = manifest.intents ?? [];
  const optionalIntents = manifest.optionalIntents ?? [];
  const optionalSeen = new Set<string>();
  for (const intent of optionalIntents) {
    if (optionalSeen.has(intent)) {
      errors.push(`intent "${intent}" is declared twice in optionalIntents`);
    }
    optionalSeen.add(intent);
    if (intents.includes(intent)) {
      errors.push(`intent "${intent}" cannot be both required and optional`);
    }
  }
  for (const [intent, fallback] of Object.entries(manifest.intentFallbacks ?? {})) {
    if (!intents.includes(intent) && !optionalIntents.includes(intent)) {
      errors.push(`intentFallbacks names "${intent}", which the module does not declare`);
    }
    if (!fallback.trim()) {
      errors.push(`intentFallbacks.${intent} must explain what is disabled`);
    }
  }

  const seen = new Set<string>();
  for (const command of manifest.commands) {
    const label = `/${command.name || "<unnamed>"}`;
    if (!COMMAND_NAME_PATTERN.test(command.name)) errors.push(`${label}: invalid command name`);
    if (!command.description?.trim()) errors.push(`${label}: description is required`);
    if (command.description && command.description.length > 100) {
      errors.push(`${label}: description must be 100 characters or fewer`);
    }
    if (typeof command.execute !== "function") errors.push(`${label}: execute must be a function`);
    if (seen.has(command.name)) errors.push(`${label}: declared twice in this module`);
    seen.add(command.name);

    if (command.subcommands?.length && command.groups?.length) {
      errors.push(`${label}: use either subcommands or groups, not both`);
    }
    if ((command.subcommands?.length || command.groups?.length) && (command.options?.length ?? 0) > 0) {
      errors.push(`${label}: a root with subcommands cannot also declare root options`);
    }

    validateOptions(label, command.options ?? [], errors);

    const subcommandNames = new Set<string>();
    const direct = command.subcommands ?? [];
    if (direct.length > 25) errors.push(`${label}: Discord allows at most 25 subcommands`);
    for (const subcommand of direct) {
      validateSubcommand(label, subcommand, subcommandNames, errors);
    }

    const groups = command.groups ?? [];
    if (groups.length > 25) errors.push(`${label}: Discord allows at most 25 subcommand groups`);
    const groupNames = new Set<string>();
    for (const group of groups) {
      validateGroup(label, group, groupNames, subcommandNames, errors);
    }
  }

  return errors;
}

function validateOptions(label: string, options: readonly CommandOption[], errors: string[]): void {
  if (options.length > 25) errors.push(`${label}: Discord allows at most 25 options`);
  let sawOptional = false;
  for (const option of options) {
    if (!COMMAND_NAME_PATTERN.test(option.name)) {
      errors.push(`${label}: invalid option name "${option.name}"`);
    }
    if (!option.description?.trim()) {
      errors.push(`${label}: option "${option.name}" needs a description`);
    }
    if (option.required) {
      if (sawOptional) {
        errors.push(`${label}: required option "${option.name}" cannot follow an optional option`);
      }
    } else {
      sawOptional = true;
    }
  }
}

function validateSubcommand(
  rootLabel: string,
  subcommand: SubcommandDefinition,
  names: Set<string>,
  errors: string[],
): void {
  const label = `${rootLabel} ${subcommand.name || "<unnamed>"}`;
  if (!COMMAND_NAME_PATTERN.test(subcommand.name)) errors.push(`${label}: invalid subcommand name`);
  if (!subcommand.description?.trim()) errors.push(`${label}: description is required`);
  if (subcommand.description && subcommand.description.length > 100) {
    errors.push(`${label}: description must be 100 characters or fewer`);
  }
  if (names.has(subcommand.name)) errors.push(`${label}: declared twice in this command`);
  names.add(subcommand.name);
  validateOptions(label, subcommand.options ?? [], errors);
}

function validateGroup(
  rootLabel: string,
  group: CommandGroupDefinition,
  groupNames: Set<string>,
  subcommandNames: Set<string>,
  errors: string[],
): void {
  const label = `${rootLabel} ${group.name || "<unnamed>"}`;
  if (!COMMAND_NAME_PATTERN.test(group.name)) errors.push(`${label}: invalid group name`);
  if (!group.description?.trim()) errors.push(`${label}: group description is required`);
  if (group.description && group.description.length > 100) {
    errors.push(`${label}: group description must be 100 characters or fewer`);
  }
  if (groupNames.has(group.name)) errors.push(`${label}: group declared twice in this command`);
  groupNames.add(group.name);
  if (!Array.isArray(group.subcommands) || group.subcommands.length === 0) {
    errors.push(`${label}: a group needs at least one subcommand`);
    return;
  }
  if (group.subcommands.length > 25) errors.push(`${label}: Discord allows at most 25 subcommands`);
  for (const subcommand of group.subcommands) {
    validateSubcommand(`${rootLabel} ${group.name}`, subcommand, subcommandNames, errors);
  }
}
