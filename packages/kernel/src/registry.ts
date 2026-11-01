import { validateManifest } from "./manifest";
import type { ModuleManifest } from "./manifest";
import type {
  CapabilityReport,
  CommandDefinition,
  IntentCapability,
  IntentProfile,
} from "./types";

export interface RegisteredCommand {
  moduleId: string;
  definition: CommandDefinition;
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
      const owner = this.#commands.get(command.name);
      if (owner) {
        errors.push(
          `/${command.name} is already owned by "${owner.moduleId}" — Discord command names are global`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid module "${manifest.id}":\n- ${errors.join("\n- ")}`);
    }

    this.#modules.set(manifest.id, manifest);
    for (const command of manifest.commands) {
      this.#commands.set(command.name, { moduleId: manifest.id, definition: command });
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

  getCommand(name: string): RegisteredCommand | undefined {
    return this.#commands.get(name);
  }

  listCommands(): RegisteredCommand[] {
    return [...this.#commands.values()];
  }

  commandNames(): string[] {
    return [...this.#commands.keys()];
  }

  get commandCount(): number {
    return this.#commands.size;
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
