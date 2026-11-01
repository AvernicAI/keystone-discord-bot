/**
 * Discord's command payloads carry fields we do not control (localisations,
 * defaults, permission flags). Comparing raw JSON would report drift forever.
 * This reduces a command to the parts we author: its name, description, and the
 * option/subcommand tree. A payload-only change such as turning a flat
 * `action` option into real subcommands is therefore visible to boot sync.
 */
interface OptionJson {
  name: string;
  type: number;
  description?: string;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  min_value?: number;
  max_value?: number;
  options?: OptionJson[];
}

export interface CommandJson {
  name: string;
  description: string;
  options?: OptionJson[];
}

function optionShape(option: OptionJson): unknown {
  return {
    name: option.name,
    type: option.type,
    description: option.description ?? "",
    required: option.required ?? false,
    ...(option.choices
      ? { choices: option.choices.map((choice) => [choice.name, choice.value]) }
      : {}),
    ...(option.min_value !== undefined ? { min_value: option.min_value } : {}),
    ...(option.max_value !== undefined ? { max_value: option.max_value } : {}),
    ...(option.options && option.options.length > 0
      ? { options: option.options.map(optionShape) }
      : {}),
  };
}

export function commandShape(command: CommandJson): string {
  return JSON.stringify({
    name: command.name,
    description: command.description,
    options: (command.options ?? []).map(optionShape),
  });
}

export interface CommandDrift {
  missing: string[];
  extra: string[];
  changed: string[];
}

/** Compare what we intend to register with what Discord currently has. */
export function commandDrift(
  expected: readonly CommandJson[],
  server: readonly CommandJson[],
): CommandDrift {
  const expectedByName = new Map(expected.map((command) => [command.name, commandShape(command)]));
  const serverByName = new Map(server.map((command) => [command.name, commandShape(command)]));
  return {
    missing: [...expectedByName.keys()].filter((name) => !serverByName.has(name)),
    extra: [...serverByName.keys()].filter((name) => !expectedByName.has(name)),
    changed: [...expectedByName.entries()]
      .filter(([name, shape]) => serverByName.has(name) && serverByName.get(name) !== shape)
      .map(([name]) => name),
  };
}

export function hasDrift(drift: CommandDrift): boolean {
  return drift.missing.length > 0 || drift.extra.length > 0 || drift.changed.length > 0;
}

/**
 * The one conversion point from discord.js command objects to the slim shape
 * the comparator reads. `toJSON()` also drops the class methods; the cast is
 * limited to this adapter, like every other discord.js boundary.
 */
export function toCommandJson(command: { toJSON(): unknown }): CommandJson {
  return command.toJSON() as CommandJson;
}
