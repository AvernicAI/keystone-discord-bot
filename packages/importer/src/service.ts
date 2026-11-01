import { createHash } from "node:crypto";
import { createBundle, checksumSnapshot, type ExportBundle } from "./bundle";
import { diffSnapshots, type SnapshotDiff } from "./diff";
import { computeDrift, collectResourceRefs, type DriftReport, type LiveGuildFacts } from "./drift";
import type { ImportedTranscript } from "./sources/transcripts";
import type { LevelImport, LevelImportRow } from "./sources/levels";
import { keystoneLevelForXp } from "./sources/levels";
import {
  GuildSnapshotSchema,
  ROLLBACK_WINDOW_MS,
  snapshotCounts,
  type GuildSnapshot,
} from "./types";
import type {
  ImportRecord,
  ImportReceipt,
  LevelApplyMode,
  PortabilityStore,
} from "./store";

export interface BundleImportOptions {
  readonly mode: "replace" | "merge";
  /** Used only by merge; replace restores the bundle's exact levels. */
  readonly levelMode?: LevelApplyMode;
  readonly dryRun?: boolean;
  readonly actorId?: string;
}

export interface ImportOutcome {
  readonly state: "dry-run" | "applied" | "failed";
  readonly importId?: string;
  readonly backupId?: string;
  readonly receipt: ImportReceipt;
  readonly diff: SnapshotDiff;
}

export class PortabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortabilityError";
  }
}

/**
 * The service is the whole portability policy: validate, diff, snapshot the old
 * guild, write in one transaction, verify, and leave a receipt. The database
 * adapter only knows how to move rows.
 */
export class PortabilityService {
  constructor(
    private readonly store: PortabilityStore,
    private readonly now: () => number = Date.now,
  ) {}

  async exportGuild(guildId: string): Promise<ExportBundle> {
    const snapshot = await this.store.snapshot(guildId);
    return createBundle(snapshot, { generator: "keystone portability v1", now: new Date(this.now()).toISOString() });
  }

  async preview(bundle: ExportBundle, destinationGuildId: string): Promise<SnapshotDiff> {
    const current = await this.store.snapshot(destinationGuildId);
    return diffSnapshots(current, rebase(bundle.snapshot, destinationGuildId));
  }

  async importBundle(
    bundle: ExportBundle,
    destinationGuildId: string,
    options: BundleImportOptions,
  ): Promise<ImportOutcome> {
    const current = await this.store.snapshot(destinationGuildId);
    const incoming = rebase(bundle.snapshot, destinationGuildId);
    const target =
      options.mode === "replace"
        ? incoming
        : mergeSnapshot(current, incoming, options.levelMode ?? "keep-higher");
    const diff = diffSnapshots(current, target);
    const warnings = [...diff.warnings];
    if (options.mode === "merge") {
      warnings.push(
        "Merge imports settings and levels only; cases, tickets, ledger history and audit events stay as they are.",
      );
    }

    const baseReceipt: ImportReceipt = {
      source: "keystone-export",
      mode: options.mode,
      checksum: checksumSnapshot(target),
      counts: snapshotCounts(incoming),
      previousCounts: snapshotCounts(current),
      diff: {
        added: diff.settings.added,
        changed: diff.settings.changed,
        removed: diff.settings.removed,
      },
      warnings,
      ...(options.actorId ? { actorId: options.actorId } : {}),
      dryRun: Boolean(options.dryRun),
    };

    if (options.dryRun) {
      return { state: "dry-run", receipt: baseReceipt, diff };
    }

    const backup = await this.store.createBackup(destinationGuildId, "pre-import", current);
    const record = await this.store.createImport(destinationGuildId, "keystone-export", {
      ...baseReceipt,
      backupId: backup.id,
    });

    try {
      await this.store.replaceGuild(destinationGuildId, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.updateImport(record.id, "failed", {
        ...baseReceipt,
        backupId: backup.id,
        error: message,
      });
      throw new PortabilityError(`Import failed and was rolled back: ${message}`);
    }

    const after = await this.store.snapshot(destinationGuildId);
    const verified = checksumSnapshot(after) === checksumSnapshot(target);
    const appliedReceipt: ImportReceipt = {
      ...baseReceipt,
      backupId: backup.id,
      verified,
      appliedAt: new Date(this.now()).toISOString(),
      warnings: verified
        ? warnings
        : [...warnings, "Post-import checksum did not match; inspect the receipt before trusting this restore."],
    };
    await this.store.updateImport(record.id, "applied", appliedReceipt);
    return {
      state: "applied",
      importId: record.id,
      backupId: backup.id,
      receipt: appliedReceipt,
      diff,
    };
  }

  async rollback(importId: string): Promise<ImportRecord> {
    const record = await this.store.getImport(importId);
    if (!record) throw new PortabilityError(`Import ${importId} was not found.`);
    if (record.state !== "applied") {
      throw new PortabilityError(`Import ${importId} is ${record.state}; only an applied import can be rolled back.`);
    }
    const backupId = record.receipt?.backupId;
    if (!backupId) throw new PortabilityError("That import has no pre-import backup.");
    if (this.now() - Date.parse(record.updatedAt) > ROLLBACK_WINDOW_MS) {
      throw new PortabilityError("The 24-hour rollback window has closed. Restore an export bundle instead.");
    }
    const backup = await this.store.getBackup(backupId);
    if (!backup) throw new PortabilityError("The pre-import backup is missing; restore an export bundle instead.");

    const snapshot = GuildSnapshotSchema.parse(backup.payload);
    await this.store.replaceGuild(record.guildId, rebase(snapshot, record.guildId));
    const receipt: ImportReceipt = {
      ...(record.receipt ?? { source: "keystone-export", warnings: [] }),
      rolledBackAt: new Date(this.now()).toISOString(),
    };
    return this.store.updateImport(record.id, "rolled-back", receipt);
  }

  async importLevels(
    imported: LevelImport,
    destinationGuildId: string,
    options: { mode: LevelApplyMode; dryRun?: boolean; actorId?: string },
  ): Promise<ImportOutcome> {
    const current = await this.store.snapshot(destinationGuildId);
    const result = await this.store.applyLevels(
      destinationGuildId,
      imported.rows,
      options.mode,
      Boolean(options.dryRun),
    );
    const diff = diffSnapshots(current, current);
    const receipt: ImportReceipt = {
      source: imported.source,
      mode: options.mode,
      counts: snapshotCounts(current),
      warnings: imported.warnings,
      levelRows: imported.rows.length,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped + imported.skipped,
      ...(options.actorId ? { actorId: options.actorId } : {}),
      dryRun: Boolean(options.dryRun),
    };

    if (options.dryRun) {
      return { state: "dry-run", receipt, diff };
    }

    const backup = await this.store.createBackup(destinationGuildId, "pre-level-import", current);
    const record = await this.store.createImport(destinationGuildId, imported.source, {
      ...receipt,
      backupId: backup.id,
    });
    const applied: ImportReceipt = {
      ...receipt,
      backupId: backup.id,
      appliedAt: new Date(this.now()).toISOString(),
    };
    await this.store.updateImport(record.id, "applied", applied);
    return {
      state: "applied",
      importId: record.id,
      backupId: backup.id,
      receipt: applied,
      diff,
    };
  }

  async deleteGuild(guildId: string, actorId: string): Promise<{ record: ImportRecord; counts: ReturnType<typeof snapshotCounts> }> {
    const before = await this.store.snapshot(guildId);
    const counts = snapshotCounts(before);
    const receipt: ImportReceipt = {
      source: "deletion",
      checksum: checksumSnapshot(before),
      counts,
      warnings: [
        "The deletion receipt records counts and a content hash only; the deleted rows and backups are gone.",
      ],
      actorId,
      deletedAt: new Date(this.now()).toISOString(),
      deletedGuild: guildId,
    };
    // The store inserts the receipt in the same transaction as the deletes. A
    // crash cannot leave a guild deleted with no record of what happened.
    const record = await this.store.deleteGuild(guildId, receipt);
    return { record, counts };
  }

  async archiveTranscript(
    guildId: string,
    transcript: ImportedTranscript,
    actorId: string,
  ): Promise<string> {
    const digest = createHash("sha256")
      .update(`${transcript.title}\u0000${transcript.text}`)
      .digest("hex")
      .slice(0, 16);
    const key = `transcript:${this.now()}:${digest}`;
    await this.store.archiveTranscript(guildId, key, {
      title: transcript.title,
      source: transcript.source,
      text: transcript.text,
      messageCount: transcript.messageCount,
      warnings: transcript.warnings,
      importedBy: actorId,
      importedAt: new Date(this.now()).toISOString(),
    });
    return key;
  }

  async drift(
    guildId: string,
    live: LiveGuildFacts,
    expectedAutoModRules: readonly string[] = [],
  ): Promise<DriftReport> {
    const snapshot = await this.store.snapshot(guildId);
    const settings = Object.fromEntries(
      Object.entries(groupSettings(snapshot)).map(([module, values]) => [module, values]),
    );
    return computeDrift(collectResourceRefs(settings), live, expectedAutoModRules);
  }
}

export function groupSettings(snapshot: GuildSnapshot): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of snapshot.settings) {
    const target = (result[row.module] ??= {});
    target[row.key] = row.value;
  }
  return result;
}

/** Restore into a different guild without rewriting any row by hand. */
export function rebase(snapshot: GuildSnapshot, guildId: string): GuildSnapshot {
  return { ...snapshot, guild: { ...snapshot.guild, id: guildId } };
}

/**
 * Merge is intentionally narrow: settings and levels. Concatenating cases or
 * ledger entries from two guilds would create duplicate case numbers and money
 * with no shared history, which looks like a successful restore and is not.
 */
export function mergeSnapshot(
  current: GuildSnapshot,
  incoming: GuildSnapshot,
  levelMode: LevelApplyMode,
): GuildSnapshot {
  const settings = new Map(
    current.settings.map((row) => [`${row.module}\u0000${row.key}`, row]),
  );
  for (const row of incoming.settings) {
    settings.set(`${row.module}\u0000${row.key}`, row);
  }

  const levels = new Map(current.levels.map((row) => [row.userId, row]));
  for (const row of incoming.levels) {
    const existing = levels.get(row.userId);
    const xp =
      levelMode === "add-on-top"
        ? (existing?.xp ?? 0) + row.xp
        : levelMode === "keep-higher"
          ? Math.max(existing?.xp ?? 0, row.xp)
          : row.xp;
    levels.set(row.userId, {
      userId: row.userId,
      xp,
      level: keystoneLevelForXp(xp),
      updatedAt: row.updatedAt,
    });
  }

  return {
    ...current,
    settings: [...settings.values()].sort((a, b) =>
      `${a.module}.${a.key}`.localeCompare(`${b.module}.${b.key}`),
    ),
    levels: [...levels.values()].sort((a, b) => a.userId.localeCompare(b.userId)),
  };
}

export type { LevelImportRow };
