import type { ZodTypeAny } from "zod";
import type { CommandDefinition } from "./types";

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

    const options = command.options ?? [];
    if (options.length > 25) errors.push(`${label}: Discord allows at most 25 options`);
    let sawOptional = false;
    for (const option of options) {
      if (!COMMAND_NAME_PATTERN.test(option.name)) errors.push(`${label}: invalid option name "${option.name}"`);
      if (!option.description?.trim()) errors.push(`${label}: option "${option.name}" needs a description`);
      if (option.required) {
        if (sawOptional) {
          errors.push(`${label}: required option "${option.name}" cannot follow an optional option`);
        }
      } else {
        sawOptional = true;
      }
    }
  }

  return errors;
}
