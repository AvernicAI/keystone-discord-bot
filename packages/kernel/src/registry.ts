import { validateManifest } from "./manifest";
import type { ModuleManifest } from "./manifest";
import type {
  CapabilityReport,
  CommandCatalogEntry,
  CommandDefinition,
  CommandType,
  IntentCapability,
  IntentProfile,
} from "./types";

export interface RegisteredCommand {
  moduleId: string;
  definition: CommandDefinition;
}

/** Chat-input and context menus may share a display name; the key includes type. */
function commandKey(name: string, type: CommandType = "chat-input"): string {
  return `${type}:${name}`;
}

/**
 * The single source of truth for "what can this bot do". Adding a feature means
 * registering a module — never editing a central switch statement.
 */
export class ModuleRegistry {
  readonly #modules = new Map<string, ModuleManifest>();
  readonly #commands = new Map<string, RegisteredCommand>();

  register(manifest: ModuleManifest): this {
    const errors = validateManifest(manifest);

    if (this.#modules.has(manifest.id)) {
      errors.push(`module id "${manifest.id}" is already registered`);
    }

    for (const command of manifest.commands) {
      const type = command.type ?? "chat-input";
      const owner = this.#commands.get(commandKey(command.name, type));
      if (owner) {
        const label = type === "chat-input" ? `/${command.name}` : `${type} menu "${command.name}"`;
        errors.push(`${label} is already owned by "${owner.moduleId}" — command names are global per type`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid module "${manifest.id}":\n- ${errors.join("\n- ")}`);
    }

    this.#modules.set(manifest.id, manifest);
    for (const command of manifest.commands) {
      this.#commands.set(commandKey(command.name, command.type ?? "chat-input"), {
        moduleId: manifest.id,
        definition: command,
      });
    }
    return this;
  }

  registerAll(manifests: readonly ModuleManifest[]): this {
    for (const manifest of manifests) this.register(manifest);
    return this;
  }

  getModule(id: string): ModuleManifest | undefined {
    return this.#modules.get(id);
  }

  requireModule(id: string): ModuleManifest {
    const manifest = this.#modules.get(id);
    if (!manifest) throw new Error(`Unknown module "${id}"`);
    return manifest;
  }

  listModules(): ModuleManifest[] {
    return [...this.#modules.values()];
  }

  getCommand(name: string, type: CommandType = "chat-input"): RegisteredCommand | undefined {
    return this.#commands.get(commandKey(name, type));
  }

  /** Every registered application command, including context menus. */
  listCommands(): RegisteredCommand[] {
    return [...this.#commands.values()];
  }

  /** Chat-input roots only; this is the surface `/` and `/help` describe. */
  commandNames(): string[] {
    return this.listCommands()
      .filter(({ definition }) => (definition.type ?? "chat-input") === "chat-input")
      .map(({ definition }) => definition.name);
  }

  contextMenuNames(): string[] {
    return this.listCommands()
      .filter(({ definition }) => (definition.type ?? "chat-input") !== "chat-input")
      .map(({ definition }) => definition.name);
  }

  get commandCount(): number {
    return this.commandNames().length;
  }

  get contextMenuCount(): number {
    return this.contextMenuNames().length;
  }

  /**
   * The flat discovery model `/help` and the generated catalog read. It is
   * derived from the definitions, so it cannot drift from what Discord gets.
   */
  catalog(): CommandCatalogEntry[] {
    return this.listCommands().map(({ definition, moduleId }) => ({
      name: definition.name,
      type: definition.type ?? "chat-input",
      moduleId,
      description: definition.description,
      options: definition.options ?? [],
      help: definition.help,
      subcommands: [
        ...(definition.subcommands ?? []).map((subcommand) => ({
          name: subcommand.name,
          description: subcommand.description,
          options: subcommand.options ?? [],
          help: subcommand.help,
        })),
        ...(definition.groups ?? []).flatMap((group) =>
          group.subcommands.map((subcommand) => ({
            name: subcommand.name,
            description: subcommand.description,
            group: group.name,
            options: subcommand.options ?? [],
            help: subcommand.help,
          })),
        ),
      ],
    }));
  }

  /** Union of every registered module's required gateway intents. */
  intents(): string[] {
    const set = new Set<string>();
    for (const manifest of this.#modules.values()) {
      for (const intent of manifest.intents ?? []) set.add(intent);
    }
    return [...set].sort();
  }

  /** Union of every registered module's optional (usually privileged) intents. */
  optionalIntents(): string[] {
    const set = new Set<string>();
    for (const manifest of this.#modules.values()) {
      for (const intent of manifest.optionalIntents ?? []) set.add(intent);
    }
    return [...set].sort();
  }

  /** The exact intent list for a deployment profile. */
  intentsForProfile(profile: IntentProfile): string[] {
    const set = new Set(this.intents());
    if (profile === "full") {
      for (const intent of this.optionalIntents()) set.add(intent);
    }
    return [...set].sort();
  }

  /**
   * The capability report `/setup` shows. It records what was requested, not
   * what Discord granted: an app that requests an intent it has not enabled
   * fails at login with close code 4014, so there is nothing to report yet.
   */
  capabilityReport(profile: IntentProfile): CapabilityReport {
    const required = new Map<string, Set<string>>();
    const optional = new Map<string, Set<string>>();
    const fallbacks = new Map<string, Map<string, string>>();

    for (const manifest of this.#modules.values()) {
      for (const intent of manifest.intents ?? []) {
        if (!required.has(intent)) required.set(intent, new Set());
        required.get(intent)?.add(manifest.id);
      }
      for (const intent of manifest.optionalIntents ?? []) {
        if (!optional.has(intent)) optional.set(intent, new Set());
        optional.get(intent)?.add(manifest.id);
      }
      for (const [intent, fallback] of Object.entries(manifest.intentFallbacks ?? {})) {
        if (!fallbacks.has(intent)) fallbacks.set(intent, new Map());
        fallbacks.get(intent)?.set(manifest.id, fallback);
      }
    }

    const names = [...new Set([...required.keys(), ...optional.keys()])].sort();
    const intents: IntentCapability[] = names.map((name) => {
      const kind = required.has(name) ? "required" : "optional";
      const requested = kind === "required" || profile === "full";
      const modules = [...new Set([...(required.get(name) ?? []), ...(optional.get(name) ?? [])])].sort();
      const fallbackEntries = [...(fallbacks.get(name) ?? new Map()).entries()];
      return {
        name,
        kind,
        requested,
        modules,
        fallback:
          kind === "optional" && fallbackEntries.length > 0
            ? fallbackEntries.map(([moduleId, text]) => `${moduleId} — ${text}`).join("; ")
            : undefined,
      };
    });

    return {
      profile,
      intents,
      disabledFeatures: intents
        .filter((intent) => !intent.requested && intent.fallback)
        .map((intent) => `${intent.name}: ${intent.fallback}`),
    };
  }

  /** Union of every permission a module declares it needs. */
  permissions(): string[] {
    const set = new Set<string>();
    for (const manifest of this.#modules.values()) {
      for (const permission of manifest.permissions ?? []) set.add(permission);
    }
    return [...set].sort();
  }
}
