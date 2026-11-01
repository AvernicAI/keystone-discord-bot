import type { GuildSnapshot, SnapshotCounts } from "./types";
import type { LevelImportRow } from "./sources/levels";

export type ImportState = "pending" | "applied" | "failed" | "rolled-back" | "deleted";

export interface ImportReceipt {
  readonly source: string;
  readonly mode?: string;
  readonly checksum?: string;
  readonly counts?: SnapshotCounts;
  readonly previousCounts?: SnapshotCounts;
  readonly diff?: {
    readonly added: number;
    readonly changed: number;
    readonly removed: number;
  };
  readonly warnings: readonly string[];
  readonly actorId?: string;
  readonly backupId?: string;
  readonly dryRun?: boolean;
  readonly verified?: boolean;
  readonly error?: string;
  readonly appliedAt?: string;
  readonly rolledBackAt?: string;
  readonly deletedAt?: string;
  readonly deletedGuild?: string;
  readonly levelRows?: number;
  readonly created?: number;
  readonly updated?: number;
  readonly unchanged?: number;
  readonly skipped?: number;
}

export interface ImportRecord {
  readonly id: string;
  readonly guildId: string;
  readonly source: string;
  readonly state: ImportState;
  readonly receipt: ImportReceipt | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BackupRecord {
  readonly id: string;
  readonly guildId: string;
  readonly kind: string;
  readonly state: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export type LevelApplyMode = "replace" | "keep-higher" | "add-on-top";

export interface LevelApplyResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
}

/**
 * The one surface portability needs from a database. It is deliberately not
 * Drizzle and not `CommunityStore`: a restore has to write tables no feature
 * module owns, and the composition root must still be able to run it against a
 * fixture in a test.
 */
export interface PortabilityStore {
  snapshot(guildId: string): Promise<GuildSnapshot>;
  /** Replace every guild-scoped row in one transaction. */
  replaceGuild(guildId: string, snapshot: GuildSnapshot): Promise<void>;
  applyLevels(
    guildId: string,
    rows: readonly LevelImportRow[],
    mode: LevelApplyMode,
    dryRun: boolean,
  ): Promise<LevelApplyResult>;
  archiveTranscript(guildId: string, key: string, data: unknown): Promise<void>;
  createImport(guildId: string, source: string, receipt: ImportReceipt): Promise<ImportRecord>;
  updateImport(id: string, state: ImportState, receipt: ImportReceipt): Promise<ImportRecord>;
  getImport(id: string): Promise<ImportRecord | undefined>;
  createBackup(guildId: string, kind: string, payload: unknown): Promise<BackupRecord>;
  getBackup(id: string): Promise<BackupRecord | undefined>;
  /** Removes every guild-scoped row and writes the receipt in one transaction. */
  deleteGuild(guildId: string, receipt: ImportReceipt): Promise<ImportRecord>;
}
