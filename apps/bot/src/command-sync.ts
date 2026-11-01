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
  /** Chat-input commands have one; context menus do not. */
  description?: string;
  /** 1 chat-input (default), 2 user menu, 3 message menu. */
  type?: number;
  options?: OptionJson[];
}

/** Discord scopes names per command type, so the key must include the type. */
function commandKey(command: CommandJson): string {
  return `${command.type ?? 1}:${command.name}`;
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
    /** Context menus carry no description; the type is the whole shape. */
    type: command.type ?? 1,
    description: command.description ?? "",
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
  const expectedByKey = new Map(expected.map((command) => [commandKey(command), command]));
  const serverByKey = new Map(server.map((command) => [commandKey(command), command]));
  return {
    missing: [...expectedByKey.keys()]
      .filter((key) => !serverByKey.has(key))
      .map((key) => expectedByKey.get(key)!.name),
    extra: [...serverByKey.keys()]
      .filter((key) => !expectedByKey.has(key))
      .map((key) => serverByKey.get(key)!.name),
    changed: [...expectedByKey.entries()]
      .filter(([key, command]) => {
        const live = serverByKey.get(key);
        return live !== undefined && commandShape(live) !== commandShape(command);
      })
      .map(([, command]) => command.name),
  };
}

export function hasDrift(drift: CommandDrift): boolean {
  return drift.missing.length > 0 || drift.extra.length > 0 || drift.changed.length > 0;
}
