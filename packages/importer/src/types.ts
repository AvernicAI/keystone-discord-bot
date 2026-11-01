import { z } from "zod";

/**
 * The export format is deliberately a plain JSON document. A stranger can open
 * it, diff it and read it. NDJSON is friendlier for streaming a 5,000-member
 * guild, but it makes a checksum and a one-file download harder to explain;
 * the size cap and the CLI are the honest trade for v1.
 */
export const EXPORT_FORMAT = "keystone.export" as const;
export const EXPORT_VERSION = 1 as const;
export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
export const ROLLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

const dateString = z.string().min(1);
const id = z.string().min(1);
const json = z.unknown();

export const GuildRowSchema = z.object({
  id,
  name: z.string().nullable(),
  locale: z.string(),
  plan: z.string(),
  joinedAt: dateString,
  leftAt: dateString.nullable(),
});
export type GuildRow = z.infer<typeof GuildRowSchema>;

export const SettingRowSchema = z.object({
  module: id,
  key: id,
  value: json,
  updatedAt: dateString,
});
export type SettingRow = z.infer<typeof SettingRowSchema>;

export const MemberRowSchema = z.object({
  userId: id,
  joinedAt: dateString,
  quarantined: z.boolean(),
  verifiedAt: dateString.nullable(),
  updatedAt: dateString,
});
export type MemberRow = z.infer<typeof MemberRowSchema>;

export const CaseRowSchema = z.object({
  id,
  caseNumber: z.number().int().positive(),
  actorId: id,
  targetId: id,
  action: z.string(),
  reason: z.string().nullable(),
  rule: z.string().nullable(),
  state: z.string(),
  evidence: json,
  createdAt: dateString,
  updatedAt: dateString,
});
export type CaseRow = z.infer<typeof CaseRowSchema>;

export const CaseEventRowSchema = z.object({
  id,
  caseId: id,
  type: z.string(),
  actorId: id.nullable(),
  data: json,
  createdAt: dateString,
});
export type CaseEventRow = z.infer<typeof CaseEventRowSchema>;

export const TicketRowSchema = z.object({
  id,
  channelId: id,
  openerId: id,
  claimerId: id.nullable(),
  state: z.string(),
  subject: z.string().nullable(),
  slaDueAt: dateString.nullable(),
  closedAt: dateString.nullable(),
  createdAt: dateString,
  updatedAt: dateString,
});
export type TicketRow = z.infer<typeof TicketRowSchema>;

export const LevelRowSchema = z.object({
  userId: id,
  xp: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  updatedAt: dateString,
});
export type LevelRow = z.infer<typeof LevelRowSchema>;

export const XpEventRowSchema = z.object({
  id,
  userId: id,
  amount: z.number().int(),
  source: z.string(),
  idempotencyKey: z.string(),
  createdAt: dateString,
});
export type XpEventRow = z.infer<typeof XpEventRowSchema>;

export const LedgerRowSchema = z.object({
  id,
  userId: id,
  amount: z.number().int(),
  reason: z.string(),
  actorId: id.nullable(),
  idempotencyKey: z.string(),
  createdAt: dateString,
});
export type LedgerRow = z.infer<typeof LedgerRowSchema>;

export const AuditRowSchema = z.object({
  id,
  actorId: id.nullable(),
  action: z.string(),
  targetId: id.nullable(),
  data: json,
  createdAt: dateString,
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

export const CommunityRecordRowSchema = z.object({
  kind: id,
  key: id,
  data: json,
  createdAt: dateString,
  updatedAt: dateString,
});
export type CommunityRecordRow = z.infer<typeof CommunityRecordRowSchema>;

export const AiDocumentRowSchema = z.object({
  id,
  name: z.string(),
  content: z.string(),
  chunks: json,
  createdAt: dateString,
  updatedAt: dateString,
});
export type AiDocumentRow = z.infer<typeof AiDocumentRowSchema>;

export const AiUsageRowSchema = z.object({
  period: z.string(),
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  updatedAt: dateString,
});
export type AiUsageRow = z.infer<typeof AiUsageRowSchema>;

export const GuildSnapshotSchema = z.object({
  guild: GuildRowSchema,
  settings: z.array(SettingRowSchema),
  members: z.array(MemberRowSchema),
  cases: z.array(CaseRowSchema),
  caseEvents: z.array(CaseEventRowSchema),
  tickets: z.array(TicketRowSchema),
  levels: z.array(LevelRowSchema),
  xpEvents: z.array(XpEventRowSchema),
  economyLedger: z.array(LedgerRowSchema),
  auditEvents: z.array(AuditRowSchema),
  communityRecords: z.array(CommunityRecordRowSchema),
  aiDocuments: z.array(AiDocumentRowSchema),
  aiUsage: z.array(AiUsageRowSchema),
  caseCounter: z.object({ nextCaseNumber: z.number().int().positive() }).nullable(),
});
export type GuildSnapshot = z.infer<typeof GuildSnapshotSchema>;

export const SNAPSHOT_KEYS = [
  "settings",
  "members",
  "cases",
  "caseEvents",
  "tickets",
  "levels",
  "xpEvents",
  "economyLedger",
  "auditEvents",
  "communityRecords",
  "aiDocuments",
  "aiUsage",
] as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[number];
export type SnapshotCounts = Record<SnapshotKey, number> & {
  casesUnique: number;
  levelsUnique: number;
};

export function emptySnapshot(guildId: string, now = new Date().toISOString()): GuildSnapshot {
  return {
    guild: { id: guildId, name: null, locale: "en", plan: "free", joinedAt: now, leftAt: null },
    settings: [],
    members: [],
    cases: [],
    caseEvents: [],
    tickets: [],
    levels: [],
    xpEvents: [],
    economyLedger: [],
    auditEvents: [],
    communityRecords: [],
    aiDocuments: [],
    aiUsage: [],
    caseCounter: null,
  };
}

/**
 * Counts are part of the manifest so a restore can be checked without trusting
 * a human. Unique counts catch the mistake a raw row count hides: two rows for
 * the same member.
 */
export function snapshotCounts(snapshot: GuildSnapshot): SnapshotCounts {
  const base = Object.fromEntries(
    SNAPSHOT_KEYS.map((key) => [key, snapshot[key].length]),
  ) as Record<SnapshotKey, number>;
  return {
    ...base,
    casesUnique: new Set(snapshot.cases.map((row) => row.caseNumber)).size,
    levelsUnique: new Set(snapshot.levels.map((row) => row.userId)).size,
  };
}

export const INCLUDED = [
  "guild identity and locale",
  "module settings",
  "moderation cases and their append-only events",
  "ticket metadata",
  "XP projections and the events that produced them",
  "economy ledger entries",
  "audit events",
  "community records (panels, giveaways, tags, feeds, transcript references)",
  "AI server documents",
  "aggregate AI usage counters",
] as const;

export const OMITTED = [
  "Discord messages and attachments",
  "ticket transcript files (keep the originals; only references travel)",
  "AI prompts and completions (never stored)",
  "queue receipts, sessions and operational logs",
  "member profile data the bot never stored",
] as const;
