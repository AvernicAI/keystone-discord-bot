import {
  bigint,
  boolean,
  index,
  integer,
  customType,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * JSONB that round-trips exactly.
 *
 * Drizzle's built-in jsonb mapping has two sharp edges: drivers that already
 * parsed JSON get their string values parsed a second time ("123" becomes 123),
 * and `null` is short-circuited to SQL NULL before any mapper runs. This type
 * writes JSON text and only parses when the driver handed back a string; the
 * settings column is nullable so a JSON null survives as SQL NULL, with the
 * row's presence marking that the key exists.
 */
const jsonValue = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value: unknown): string {
    const json = JSON.stringify(value);
    return json === undefined ? "null" : json;
  },
  fromDriver(value: unknown): unknown {
    return typeof value === "string" ? JSON.parse(value) : value;
  },
});

/**
 * The data spine.
 *
 * One schema, not four bots' worth of partial records. Modules never import
 * these tables directly: they go through a repository or service that the
 * composition root wires to a port. That rule is what makes the database
 * swappable in tests and the export feature possible later.
 */

// Fresh builders per table: Drizzle column builders are stateful, so sharing one
// instance between tables is a subtle bug waiting to happen.
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name"),
  locale: text("locale").notNull().default("en"),
  plan: text("plan").notNull().default("free"),
  // The migration names this column joined_at; Drizzle must match it exactly.
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

/** `(guild, module, key)` is the unique settings unit — never a JSON blob. */
export const settings = pgTable(
  "settings",
  {
    guildId: text("guild_id").notNull(),
    module: text("module").notNull(),
    key: text("key").notNull(),
    value: jsonValue("value"),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.module, table.key] }),
    index("settings_guild_module_idx").on(table.guildId, table.module),
  ],
);

export const members = pgTable(
  "members",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    quarantined: boolean("quarantined").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

/**
 * A case is the accountability record every later module references: an
 * anti-nuke action, a warning, a ticket resolution and an AI flag all produce
 * one. `case_events` is append-only, so a reversal is a new row, not an edit.
 */
export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    caseNumber: integer("case_number").notNull(),
    actorId: text("actor_id").notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    rule: text("rule"),
    state: text("state").notNull().default("open"),
    evidence: jsonValue("evidence"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("cases_guild_number_idx").on(table.guildId, table.caseNumber),
    index("cases_guild_target_idx").on(table.guildId, table.targetId),
    index("cases_guild_state_idx").on(table.guildId, table.state),
  ],
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: text("actor_id"),
    data: jsonValue("data"),
    createdAt: createdAt(),
  },
  (table) => [index("case_events_case_idx").on(table.caseId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    openerId: text("opener_id").notNull(),
    claimerId: text("claimer_id"),
    state: text("state").notNull().default("open"),
    subject: text("subject"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("tickets_guild_state_idx").on(table.guildId, table.state)],
);

export const levels = pgTable(
  "levels",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    xp: bigint("xp", { mode: "number" }).notNull().default(0),
    level: integer("level").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

/** XP is a projection; this ledger is the truth and can be replayed. */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    amount: integer("amount").notNull(),
    source: text("source").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("xp_events_idempotency_idx").on(table.idempotencyKey),
    index("xp_events_guild_user_idx").on(table.guildId, table.userId),
  ],
);

/** Append-only money. A balance is a SUM, never a mutable counter. */
export const economyLedger = pgTable(
  "economy_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("economy_ledger_idempotency_idx").on(table.idempotencyKey),
    index("economy_ledger_guild_user_idx").on(table.guildId, table.userId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetId: text("target_id"),
    data: jsonValue("data"),
    createdAt: createdAt(),
  },
  (table) => [index("audit_events_guild_idx").on(table.guildId, table.createdAt)],
);

/**
 * P3 community-owned records: panels, giveaways, tags, feeds and transcript
 * events. The typed level/economy/ticket tables stay the spine; this table is
 * for feature records that do not warrant a new SQL shape yet.
 */
export const communityRecords = pgTable(
  "community_records",
  {
    guildId: text("guild_id").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    data: jsonValue("data"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.kind, table.key] }),
    index("community_records_guild_kind_idx").on(table.guildId, table.kind),
  ],
);

/** Admin-supplied server knowledge. Chunks keep their portable vectors. */
export const aiDocuments = pgTable(
  "ai_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    chunks: jsonValue("chunks"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("ai_documents_guild_idx").on(table.guildId, table.updatedAt)],
);

/** Aggregated counters only. There is deliberately no prompt/completion column. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    guildId: text("guild_id").notNull(),
    period: text("period").notNull(),
    requests: integer("requests").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.period] })],
);

/**
 * One row per attributed member join. `(guild, member, joined_at)` is unique, so
 * a repeated gateway delivery cannot double-count an invite. The inviter is
 * nullable: vanity URLs and invites Keystone never saw still produce a row, and
 * a later "who invited me" answer is better than a silent gap.
 */
export const inviteJoins = pgTable(
  "invite_joins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    inviterId: text("inviter_id"),
    code: text("code"),
    fakeReasons: jsonValue("fake_reasons").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("invite_joins_guild_user_joined_idx").on(
      table.guildId,
      table.userId,
      table.joinedAt,
    ),
    index("invite_joins_guild_inviter_idx").on(table.guildId, table.inviterId),
  ],
);

/** Monotonic per-guild case numbers; the unique index on cases is the backstop. */
export const caseCounters = pgTable("case_counters", {
  guildId: text("guild_id").primaryKey(),
  nextCaseNumber: integer("next_case_number").notNull().default(2),
});

/** Idempotency receipts for queue work. See `packages/queue`. */
export const jobReceipts = pgTable("job_receipts", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  jobName: text("job_name").notNull(),
  status: text("status").notNull(), // claimed | completed | failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id").notNull(),
  source: text("source").notNull(),
  state: text("state").notNull().default("pending"),
  receipt: jsonValue("receipt"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const backups = pgTable("backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id").notNull(),
  kind: text("kind").notNull(),
  state: text("state").notNull().default("pending"),
  payload: jsonValue("payload"),
  createdAt: createdAt(),
});

export const webSessions = pgTable(
  "web_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    accessToken: text("access_token").notNull(),
    csrfHash: text("csrf_hash").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("web_sessions_expires_idx").on(table.expiresAt)],
);

export const schema = {
  guilds,
  settings,
  members,
  cases,
  caseEvents,
  tickets,
  levels,
  xpEvents,
  economyLedger,
  auditEvents,
  communityRecords,
  aiDocuments,
  aiUsage,
  inviteJoins,
  caseCounters,
  jobReceipts,
  imports,
  backups,
  webSessions,
};

export type Schema = typeof schema;
