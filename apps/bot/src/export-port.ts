import {
  UserError,
  type ConfigPort,
  type ExportDeleteResult,
  type ExportDriftResult,
  type ExportImportOptions,
  type ExportImportResult,
  type ExportLiveFacts,
  type ExportPort,
  type ExportRollbackResult,
  type GuildExportResult,
  type UserExportResult,
} from "@keystone/kernel";
import {
  BundleError,
  PortabilityError,
  PortabilityService,
  collectResourceRefs,
  computeDrift,
  createBundle,
  parseBundle,
  serializeBundle,
  type DriftReport,
  type GuildSnapshot,
  type ImportOutcome,
  type PortabilityStore,
} from "@keystone/importer";
import { InMemoryAiStore } from "@keystone/module-ai";
import { InMemoryCommunityStore } from "@keystone/module-community";
import { InMemoryCaseStore } from "@keystone/module-moderation";

const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;

function asUserError(error: unknown): UserError {
  if (error instanceof UserError) return error;
  if (error instanceof BundleError || error instanceof PortabilityError) {
    return new UserError(error.message);
  }
  return new UserError(
    `The export operation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function dateTag(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function bundleName(guildId: string, now: number): string {
  return `keystone-${guildId}-${dateTag(now)}.json`;
}

function userBundleName(userId: string): string {
  return `keystone-user-${userId}.json`;
}

/**
 * The SQL adapter is the same `PortabilityService` the CLI uses. The slash
 * command is a second surface over one restore policy, not a second exporter.
 */
export function createSqlExportPort(
  store: PortabilityStore,
  now: () => number = Date.now,
): ExportPort {
  const service = new PortabilityService(store, now);

  return {
    async guild(guildId: string): Promise<GuildExportResult> {
      try {
        const bundle = await service.exportGuild(guildId);
        const content = serializeBundle(bundle);
        if (Buffer.byteLength(content, "utf8") > MAX_BUNDLE_BYTES) {
          throw new UserError(
            "The guild export is larger than Discord's 25 MB attachment cap. Use `pnpm portability export` on the host instead.",
          );
        }
        return {
          guildId,
          fileName: bundleName(guildId, now()),
          content,
          checksum: bundle.manifest.checksum,
          counts: bundle.manifest.counts,
          warnings: [],
        };
      } catch (error) {
        throw asUserError(error);
      }
    },

    async user(guildId: string, userId: string): Promise<UserExportResult> {
      try {
        const bundle = await service.exportGuild(guildId);
        return userExportFromSnapshot(bundle.snapshot, userId, now());
      } catch (error) {
        throw asUserError(error);
      }
    },

    async importBundle(
      guildId: string,
      bundleText: string,
      options: ExportImportOptions,
    ): Promise<ExportImportResult> {
      try {
        const bundle = parseBundle(bundleText);
        const outcome = await service.importBundle(bundle, guildId, {
          mode: options.mode,
          dryRun: options.dryRun,
          actorId: options.actorId,
        });
        return importResult(outcome);
      } catch (error) {
        throw asUserError(error);
      }
    },

    async deleteGuild(guildId: string, actorId: string): Promise<ExportDeleteResult> {
      try {
        const { record, counts } = await service.deleteGuild(guildId, actorId);
        return {
          importId: record.id,
          guildId,
          counts,
          checksum: record.receipt?.checksum ?? "",
          deletedAt: record.receipt?.deletedAt ?? new Date(now()).toISOString(),
        };
      } catch (error) {
        throw asUserError(error);
      }
    },

    async drift(guildId: string, live: ExportLiveFacts): Promise<ExportDriftResult> {
      try {
        return driftResult(await service.drift(guildId, live));
      } catch (error) {
        throw asUserError(error);
      }
    },

    async rollback(importId: string): Promise<ExportRollbackResult> {
      try {
        const record = await service.rollback(importId);
        return {
          importId: record.id,
          guildId: record.guildId,
          state: record.state,
          rolledBackAt: record.receipt?.rolledBackAt,
        };
      } catch (error) {
        throw asUserError(error);
      }
    },
  };
}

export interface MemoryExportDeps {
  readonly config: ConfigPort;
  readonly cases: InMemoryCaseStore;
  readonly community: InMemoryCommunityStore;
  readonly ai: InMemoryAiStore;
  readonly now?: () => number;
}

/**
 * Memory mode keeps its state in the same stores the commands use. This adapter
 * reads those stores directly, so a `/export guild` run against a fresh local
 * process shows the rows that process actually holds. It cannot delete or
 * restore: those operations need a transaction, so it refuses them by name.
 */
export function createMemoryExportPort(deps: MemoryExportDeps): ExportPort {
  const now = deps.now ?? Date.now;

  return {
    async guild(guildId: string): Promise<GuildExportResult> {
      const snapshot = await memorySnapshot(guildId, deps, now);
      const bundle = createBundle(snapshot, {
        generator: "keystone memory export",
        now: new Date(now()).toISOString(),
      });
      const content = serializeBundle(bundle);
      if (Buffer.byteLength(content, "utf8") > MAX_BUNDLE_BYTES) {
        throw new UserError("The memory snapshot is larger than the 25 MB attachment cap.");
      }
      return {
        guildId,
        fileName: bundleName(guildId, now()),
        content,
        checksum: bundle.manifest.checksum,
        counts: bundle.manifest.counts,
        warnings: memoryWarnings(),
      };
    },

    async user(guildId: string, userId: string): Promise<UserExportResult> {
      const snapshot = await memorySnapshot(guildId, deps, now);
      return userExportFromSnapshot(snapshot, userId, now());
    },

    async importBundle(): Promise<ExportImportResult> {
      throw new UserError(
        "Import needs DATABASE_URL. Start Postgres, run `pnpm db:migrate`, or use `pnpm portability import` on the host.",
      );
    },

    async deleteGuild(): Promise<ExportDeleteResult> {
      throw new UserError(
        "Deletion needs DATABASE_URL. Memory mode has no transaction and no backup policy, so it refuses instead of pretending.",
      );
    },

    async drift(guildId: string, live: ExportLiveFacts): Promise<ExportDriftResult> {
      const modules = await deps.config.list(guildId);
      const settings = Object.fromEntries(
        modules.map((module) => [module.id, module.settings]),
      );
      return driftResult(computeDrift(collectResourceRefs(settings), live));
    },

    async rollback(): Promise<ExportRollbackResult> {
      throw new UserError(
        "Rollback needs DATABASE_URL; it restores the pre-import backup stored by the SQL importer.",
      );
    },
  };
}

async function memorySnapshot(
  guildId: string,
  deps: MemoryExportDeps,
  now: () => number,
): Promise<GuildSnapshot> {
  const at = new Date(now()).toISOString();
  const modules = await deps.config.list(guildId);
  const settings = modules.flatMap((module) =>
    Object.entries(module.settings).map(([key, value]) => ({
      module: module.id,
      key,
      value,
      updatedAt: at,
    })),
  );

  const cases = deps.cases.records(guildId);
  const caseEvents = cases.flatMap((record) =>
    deps.cases.events(record.id).map((event) => ({
      id: event.id,
      caseId: event.caseId,
      type: event.type,
      actorId: event.actorId ?? null,
      data: event.data ?? null,
      createdAt: event.createdAt,
    })),
  );
  const tickets = deps.community.tickets(guildId).map((ticket) => ({
    id: ticket.id,
    channelId: ticket.channelId,
    openerId: ticket.openerId,
    claimerId: ticket.claimerId ?? null,
    state: ticket.state,
    subject: ticket.subject ?? null,
    slaDueAt: ticket.slaDueAt ?? null,
    closedAt: ticket.closedAt ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }));
  const levels = deps.community.allLevels(guildId).map((profile) => ({
    userId: profile.userId,
    xp: profile.xp,
    level: profile.level,
    updatedAt: profile.updatedAt,
  }));
  const xpEvents = deps.community.allXpEvents(guildId).map((event) => ({
    id: event.id,
    userId: event.userId,
    amount: event.amount,
    source: event.source,
    idempotencyKey: event.idempotencyKey,
    createdAt: event.createdAt,
  }));
  const economyLedger = deps.community.allLedger(guildId).map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    amount: entry.amount,
    reason: entry.reason,
    actorId: entry.actorId ?? null,
    idempotencyKey: entry.idempotencyKey,
    createdAt: entry.createdAt,
  }));
  const communityRecords = deps.community.allRecords(guildId).map((record) => ({
    kind: record.kind,
    key: record.key,
    data: record.data,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
  const aiDocuments = deps.ai.allDocuments(guildId).map((document) => ({
    id: document.id,
    name: document.name,
    content: document.content,
    chunks: document.chunks,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }));
  const aiUsage = deps.ai.allUsage(guildId).map((usage) => ({
    period: usage.period,
    requests: usage.requests,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costMicros: Math.round(usage.costUsd * 1_000_000),
    updatedAt: at,
  }));

  const highestCase = cases.reduce((max, record) => Math.max(max, record.caseNumber), 0);
  return {
    guild: {
      id: guildId,
      name: null,
      locale: "en",
      plan: "free",
      joinedAt: at,
      leftAt: null,
    },
    settings,
    members: [],
    cases: cases.map((record) => ({
      id: record.id,
      caseNumber: record.caseNumber,
      actorId: record.actorId,
      targetId: record.targetId,
      action: record.action,
      reason: record.reason ?? null,
      rule: record.rule ?? null,
      state: record.state,
      evidence: record.evidence ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })),
    caseEvents,
    tickets,
    levels,
    xpEvents,
    economyLedger,
    auditEvents: [],
    communityRecords,
    aiDocuments,
    aiUsage,
    caseCounter: highestCase > 0 ? { nextCaseNumber: highestCase + 1 } : null,
  };
}

function userExportFromSnapshot(
  snapshot: GuildSnapshot,
  userId: string,
  now: number,
): UserExportResult {
  const cases = snapshot.cases.filter(
    (record) => record.targetId === userId || record.actorId === userId,
  );
  const caseIds = new Set(cases.map((record) => record.id));
  const rows = {
    members: snapshot.members.filter((row) => row.userId === userId),
    cases,
    caseEvents: snapshot.caseEvents.filter((event) => caseIds.has(event.caseId)),
    tickets: snapshot.tickets.filter(
      (ticket) => ticket.openerId === userId || ticket.claimerId === userId,
    ),
    levels: snapshot.levels.filter((row) => row.userId === userId),
    xpEvents: snapshot.xpEvents.filter((event) => event.userId === userId),
    economyLedger: snapshot.economyLedger.filter((row) => row.userId === userId),
  };
  const counts = {
    members: rows.members.length,
    cases: rows.cases.length,
    caseEvents: rows.caseEvents.length,
    tickets: rows.tickets.length,
    levels: rows.levels.length,
    xpEvents: rows.xpEvents.length,
    economyLedger: rows.economyLedger.length,
  };
  const content =
    JSON.stringify(
      {
        format: "keystone.user-export",
        version: 1,
        guildId: snapshot.guild.id,
        userId,
        generatedAt: new Date(now).toISOString(),
        counts,
        rows,
      },
      null,
      2,
    ) + "\n";

  return {
    guildId: snapshot.guild.id,
    userId,
    fileName: userBundleName(userId),
    content,
    counts,
    warnings: [
      "A user export contains that member's ids, moderation history and economy rows. Treat it as private.",
      "Settings, server documents and aggregate AI counters are server-scoped and are not repeated here.",
    ],
  };
}

function importResult(outcome: ImportOutcome): ExportImportResult {
  return {
    state: outcome.state === "dry-run" ? "dry-run" : "applied",
    importId: outcome.importId,
    checksum: outcome.receipt.checksum,
    counts: outcome.receipt.counts,
    previousCounts: outcome.receipt.previousCounts,
    diff: {
      added: outcome.diff.settings.added,
      changed: outcome.diff.settings.changed,
      removed: outcome.diff.settings.removed,
    },
    warnings: outcome.receipt.warnings,
    verified: outcome.receipt.verified,
  };
}

function driftResult(report: DriftReport): ExportDriftResult {
  return {
    refs: report.refs,
    missing: report.missing,
    permissionGaps: report.permissionGaps,
    expectedAutoModRules: report.expectedAutoModRules,
    missingAutoModRules: report.missingAutoModRules,
    readOnly: true,
  };
}

function memoryWarnings(): string[] {
  return [
    "Memory mode exported live process state. Settings are effective values; stored overrides and defaults are merged.",
    "Member profiles and audit events are not retained by the in-memory stores, so those arrays are empty.",
    "Import, deletion and rollback require DATABASE_URL; they refuse in memory mode.",
  ];
}

