/**
 * The `/export` surface in structural terms.
 *
 * The command owns formatting; the composition root owns whether the data comes
 * from Postgres or from the live in-memory stores. No module imports Drizzle or
 * discord.js to answer an export request.
 */

export interface GuildExportResult {
  readonly guildId: string;
  readonly fileName: string;
  readonly content: string;
  readonly checksum: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

export interface UserExportResult {
  readonly guildId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly content: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

export interface ExportImportOptions {
  readonly mode: "replace" | "merge";
  /** The command defaults to a preview; only an explicit false writes. */
  readonly dryRun: boolean;
  readonly actorId?: string;
}

export interface ExportImportResult {
  readonly state: "dry-run" | "applied";
  readonly importId?: string;
  readonly checksum?: string;
  readonly counts?: Readonly<Record<string, number>>;
  readonly previousCounts?: Readonly<Record<string, number>>;
  readonly diff?: {
    readonly added: number;
    readonly changed: number;
    readonly removed: number;
  };
  readonly warnings: readonly string[];
  readonly verified?: boolean;
}

export interface ExportDeleteResult {
  readonly importId: string;
  readonly guildId: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly checksum: string;
  readonly deletedAt: string;
}

export interface ExportRollbackResult {
  readonly importId: string;
  readonly guildId: string;
  readonly state: string;
  readonly rolledBackAt?: string;
}

/** The subset of Discord guild facts drift compares settings against. */
export interface ExportLiveFacts {
  readonly channels: readonly string[];
  readonly roles: readonly string[];
  readonly categories: readonly string[];
  readonly automodRules: readonly string[];
  readonly channelPermissions?: Readonly<
    Record<string, Readonly<Record<string, boolean>>>
  >;
}

export interface ExportDriftGap {
  readonly kind: "channel" | "role" | "category";
  readonly id: string;
  readonly path: string;
  readonly reason: "missing" | "not-visible";
}

export interface ExportPermissionGap {
  readonly channelId: string;
  readonly permission: string;
  readonly path: string;
}

export interface ExportDriftResult {
  readonly refs: number;
  readonly missing: readonly ExportDriftGap[];
  readonly permissionGaps: readonly ExportPermissionGap[];
  readonly expectedAutoModRules: readonly string[];
  readonly missingAutoModRules: readonly string[];
  readonly readOnly: true;
}

/**
 * One port for every export action. A build without a database still implements
 * `guild`, `user` and `drift` from its live stores and refuses the destructive
 * actions with a named reason rather than pretending they worked.
 */
export interface ExportPort {
  guild(guildId: string): Promise<GuildExportResult>;
  user(guildId: string, userId: string): Promise<UserExportResult>;
  importBundle(
    guildId: string,
    bundleText: string,
    options: ExportImportOptions,
  ): Promise<ExportImportResult>;
  deleteGuild(guildId: string, actorId: string): Promise<ExportDeleteResult>;
  drift(guildId: string, live: ExportLiveFacts): Promise<ExportDriftResult>;
  rollback(importId: string): Promise<ExportRollbackResult>;
}

/**
 * Downloads a Discord attachment without exposing `fetch` to a module. The
 * reader enforces the same 25 MB cap as the bundle parser before the command
 * hands text to the service.
 */
export interface AttachmentReader {
  read(url: string): Promise<string>;
}

export type ExportFacts = (guildId: string) => Promise<ExportLiveFacts>;
