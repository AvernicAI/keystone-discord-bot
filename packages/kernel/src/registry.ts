import { validateManifest } from "./manifest";
import type { ModuleManifest } from "./manifest";
import type { CommandDefinition } from "./types";

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

  /** Union of every permission a module declares it needs. */
  permissions(): string[] {
    const set = new Set<string>();
    for (const manifest of this.#modules.values()) {
      for (const permission of manifest.permissions ?? []) set.add(permission);
    }
    return [...set].sort();
  }
}
