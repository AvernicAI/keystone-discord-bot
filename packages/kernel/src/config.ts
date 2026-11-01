/**
 * The one settings surface a configuration command needs.
 *
 * `SettingsService` already validates every read and write against the owning
 * module's Zod schema; this port only names the operations `/config` needs. It
 * deliberately exposes no repository, no raw table and no secret.
 */
export interface ConfigModuleView {
  readonly id: string;
  readonly name: string;
  readonly settings: Record<string, unknown>;
}

export interface ConfigPort {
  /** Every registered module plus this guild's effective settings. */
  list(guildId: string): Promise<ConfigModuleView[]>;
  update(
    guildId: string,
    moduleId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
