import type { ModuleRegistry } from "./registry";
import type { ModuleSettings } from "./types";

export interface SettingsRepository {
  get(guildId: string, moduleId: string): Promise<Record<string, unknown> | undefined>;
  set(guildId: string, moduleId: string, value: Record<string, unknown>): Promise<void>;
  clear(guildId: string, moduleId: string): Promise<void>;
}

/**
 * P0 backing store. Deliberately in-memory so the whole test suite runs with no
 * Postgres. P1 adds `DrizzleSettingsRepository` against the same interface and
 * this class is not touched.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  readonly #data = new Map<string, Record<string, unknown>>();

  #key(guildId: string, moduleId: string): string {
    return `${guildId}:${moduleId}`;
  }

  async get(guildId: string, moduleId: string): Promise<Record<string, unknown> | undefined> {
    const value = this.#data.get(this.#key(guildId, moduleId));
    return value ? { ...value } : undefined;
  }

  async set(guildId: string, moduleId: string, value: Record<string, unknown>): Promise<void> {
    this.#data.set(this.#key(guildId, moduleId), { ...value });
  }

  async clear(guildId: string, moduleId: string): Promise<void> {
    this.#data.delete(this.#key(guildId, moduleId));
  }
}

/**
 * Validates every read and write against the module's Zod schema. A module
 * cannot persist a value its own schema rejects, which is what keeps a bad
 * dashboard payload from corrupting a guild's config.
 */
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly registry: ModuleRegistry,
  ) {}

  async get(guildId: string, moduleId: string): Promise<Record<string, unknown>> {
    const manifest = this.registry.requireModule(moduleId);
    const stored = await this.repository.get(guildId, moduleId);
    const merged = { ...manifest.defaultSettings, ...stored };
    return manifest.settingsSchema.parse(merged) as Record<string, unknown>;
  }

  async update(
    guildId: string,
    moduleId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const manifest = this.registry.requireModule(moduleId);
    const current = await this.get(guildId, moduleId);
    const next = manifest.settingsSchema.parse({ ...current, ...patch }) as Record<string, unknown>;
    await this.repository.set(guildId, moduleId, next);
    return next;
  }

  async reset(guildId: string, moduleId: string): Promise<void> {
    this.registry.requireModule(moduleId);
    await this.repository.clear(guildId, moduleId);
  }

  /** Bind the service to one module, which is what commands actually receive. */
  forModule(moduleId: string): ModuleSettings {
    this.registry.requireModule(moduleId);
    return {
      get: (guildId) => this.get(guildId, moduleId),
      update: (guildId, patch) => this.update(guildId, moduleId, patch),
    };
  }
}
