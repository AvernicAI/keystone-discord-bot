/**
 * Structural types the kernel speaks in.
 *
 * Deliberately NOT discord.js types: the kernel must be testable without a
 * token, a gateway, or a live guild. `apps/bot/src/adapt.ts` is the single
 * place that casts a real interaction into an `InteractionLike`.
 */

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(scope: string): Logger;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedPayload {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface ReplyInput {
  content?: string;
  embeds?: EmbedPayload[];
  ephemeral?: boolean;
  components?: ActionRow[];
}

export type ButtonStyle = "primary" | "secondary" | "success" | "danger" | "link";

/** A structural button; the Discord adapter turns this into a ButtonBuilder. */
export interface ButtonComponent {
  type: "button";
  customId: string;
  label: string;
  style: ButtonStyle;
  disabled?: boolean;
  url?: string;
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
}

/** A string select menu; the Discord adapter turns this into a SelectMenuBuilder. */
export interface SelectComponent {
  type: "select";
  customId: string;
  placeholder: string;
  minValues?: number;
  maxValues?: number;
  options: SelectOption[];
  disabled?: boolean;
}

export type MessageComponent = ButtonComponent | SelectComponent;

export interface ActionRow {
  type: "action-row";
  components: MessageComponent[];
}

/** The narrow slice of a Discord interaction that commands are allowed to use. */
export interface InteractionLike {
  /** Discord interaction id; stable across retries and the economy idempotency key. */
  readonly id: string;
  readonly commandName: string;
  readonly guildId: string | null;
  readonly channelId: string | null;
  readonly userId: string;
  /** Parsed slash-command option values; user/channel/role values are IDs. */
  readonly options: Readonly<Record<string, string | number | boolean | null>>;
  /** Permission names the invoking member holds, e.g. `["ManageGuild"]`. */
  readonly permissions: readonly string[];
  readonly replied: boolean;
  readonly deferred: boolean;
  reply(input: ReplyInput): Promise<unknown>;
  deferReply(input?: { ephemeral?: boolean }): Promise<unknown>;
  editReply(input: ReplyInput): Promise<unknown>;
  followUp(input: ReplyInput): Promise<unknown>;
}

/** Settings handle scoped to one module, handed to commands at dispatch time. */
export interface ModuleSettings {
  get(guildId: string): Promise<Record<string, unknown>>;
  update(guildId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface CooldownResult {
  readonly allowed: boolean;
  /** Milliseconds until the caller may try again. Zero when allowed. */
  readonly retryAfterMs: number;
}

/**
 * The cooldown port. P0 shipped a process-local Map; P1 swaps in Redis without
 * changing a single guard or module.
 */
export interface CooldownStore {
  hit(key: string, ttlMs: number, now?: number): Promise<CooldownResult>;
}

export interface JobOptions {
  /** Stable key so a retried enqueue cannot duplicate the side effect. */
  idempotencyKey?: string;
  delayMs?: number;
}

/**
 * The queue port. Modules enqueue by name (`queue.enqueue("levels.sync", …)`);
 * they never import BullMQ, Redis or a worker.
 */
export interface JobQueue {
  enqueue(name: string, payload: unknown, options?: JobOptions): Promise<string>;
  close(): Promise<void>;
}

export interface HealthArea {
  configured: boolean;
  reachable: boolean;
  detail?: string;
}

export interface HealthReport {
  database: HealthArea & { migrated: boolean };
  cache: HealthArea;
}

/** What `/setup` reads. Implemented by the composition root, not by a module. */
export interface HealthProbe {
  probe(): Promise<HealthReport>;
}

export type IdempotencyClaim = "run" | "done";

/**
 * Receipts that make a retried job safe. Postgres implements this in
 * `@keystone/db`; the queue calls it around every handler.
 */
export interface IdempotencyStore {
  claim(key: string, jobName: string): Promise<IdempotencyClaim>;
  complete(key: string): Promise<void>;
  fail(key: string, error: string): Promise<void>;
}

/**
 * Tracing port. The real implementation lives in `@keystone/telemetry`; the
 * kernel only needs these four methods, so it never depends on OpenTelemetry.
 */
export interface Telemetry {
  withSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Starts a span whose parent is a W3C `traceparent` carried in a job. */
  withRemoteParent<T>(name: string, traceparent: string | undefined, fn: () => Promise<T>): Promise<T>;
  /** The active W3C `traceparent`, or undefined when tracing is off. */
  traceparent(): string | undefined;
  shutdown(): Promise<void>;
}

export interface CommandContext {
  readonly interaction: InteractionLike;
  readonly moduleId: string;
  readonly guildId: string | null;
  readonly userId: string;
  readonly settings: ModuleSettings;
  readonly logger: Logger;
  /** Injected clock so cooldowns and latency are deterministic in tests. */
  readonly now: () => number;
  readonly cooldowns: CooldownStore;
  readonly queue: JobQueue;
  readonly health: HealthProbe;
  /** Present when the composition root wired the moderation adapters. */
  readonly moderation?: ModerationPort;
  /** Present when the composition root wired the P3 community adapters. */
  readonly community?: import("./community").CommunityPort;
  /** Present when the composition root wired the P4 AI provider. */
  readonly ai?: import("./ai").AiPort;
}

export type GuardResult = { ok: true } | { ok: false; message: string };
export type Guard = (ctx: CommandContext) => GuardResult | Promise<GuardResult>;

export type OptionType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "user"
  | "channel"
  | "role"
  | "mentionable"
  | "attachment";

export interface CommandChoice {
  name: string;
  value: string | number;
}

export interface CommandOption {
  type: OptionType;
  name: string;
  description: string;
  required?: boolean;
  choices?: CommandChoice[];
  minValue?: number;
  maxValue?: number;
  autocomplete?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
  /** Guards run in order, before `execute`. First failure stops dispatch. */
  guards?: Guard[];
  execute(ctx: CommandContext): Promise<void>;
  /** Teaching note surfaced in docs, never sent to Discord. */
  notes?: string;
}

/** The accountability record shared by moderation, security and appeals. */
export type ModerationCaseState =
  | "pending"
  | "open"
  | "alerted"
  | "reviewed"
  | "appealed"
  | "reversed"
  | "closed";

export interface ModerationCase {
  readonly id: string;
  readonly guildId: string;
  readonly caseNumber: number;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: string;
  readonly reason: string;
  readonly rule?: string;
  readonly state: ModerationCaseState;
  readonly evidence?: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CaseEvent {
  readonly id: string;
  readonly caseId: string;
  readonly type: string;
  readonly actorId?: string;
  readonly data?: unknown;
  readonly createdAt: string;
}

export interface NewModerationCase {
  readonly guildId: string;
  readonly caseNumber: number;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: string;
  readonly reason: string;
  readonly rule?: string;
  readonly state?: ModerationCaseState;
  readonly evidence?: unknown;
}

/** The narrow persistence port the moderation module owns. */
export interface CaseStore {
  nextCaseNumber(guildId: string): Promise<number>;
  create(input: NewModerationCase): Promise<ModerationCase>;
  get(guildId: string, caseNumber: number): Promise<ModerationCase | undefined>;
  getById(caseId: string): Promise<ModerationCase | undefined>;
  list(
    guildId: string,
    filter?: { targetId?: string; state?: ModerationCaseState; limit?: number },
  ): Promise<ModerationCase[]>;
  appendEvent(caseId: string, type: string, actorId?: string, data?: unknown): Promise<CaseEvent>;
  updateState(caseId: string, state: ModerationCaseState): Promise<void>;
}

export interface ModerationActionResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface ModerationNotice {
  readonly embeds: EmbedPayload[];
  readonly components?: ActionRow[];
}

/**
 * The external actions moderation needs. Discord implements this in `apps/bot`;
 * tests implement it with a recorder, so no command or rule needs a gateway.
 */
export interface ModerationActions {
  ban(guildId: string, userId: string, reason: string): Promise<ModerationActionResult>;
  kick(guildId: string, userId: string, reason: string): Promise<ModerationActionResult>;
  timeout(guildId: string, userId: string, seconds: number, reason: string): Promise<ModerationActionResult>;
  purge(guildId: string, channelId: string, limit: number, reason: string): Promise<ModerationActionResult>;
  lock(guildId: string, channelId: string, locked: boolean, reason: string): Promise<ModerationActionResult>;
  slowmode(guildId: string, channelId: string, seconds: number, reason: string): Promise<ModerationActionResult>;
  deleteMessage(guildId: string, channelId: string, messageId: string, reason: string): Promise<ModerationActionResult>;
  deleteWebhook(guildId: string, webhookId: string, reason: string): Promise<ModerationActionResult>;
  quarantine(guildId: string, userId: string, reason: string, roleId?: string): Promise<ModerationActionResult>;
  unquarantine(
    guildId: string,
    userId: string,
    reason: string,
    roleId?: string,
  ): Promise<ModerationActionResult>;
  notify(guildId: string, channelId: string | null | undefined, notice: ModerationNotice): Promise<void>;
}

export interface ModerationPort {
  readonly cases: CaseServicePort;
  readonly actions: ModerationActions;
}

/** The case operations commands, security rules and appeals share. */
export interface CaseServicePort {
  open(input: Omit<NewModerationCase, "caseNumber">): Promise<ModerationCase>;
  get(guildId: string, caseNumber: number): Promise<ModerationCase | undefined>;
  getById(caseId: string): Promise<ModerationCase | undefined>;
  list(
    guildId: string,
    filter?: { targetId?: string; state?: ModerationCaseState; limit?: number },
  ): Promise<ModerationCase[]>;
  note(caseId: string, actorId: string, note: string): Promise<CaseEvent>;
  review(caseId: string, actorId: string): Promise<ModerationCase>;
  appealByNumber(
    guildId: string,
    caseNumber: number,
    actorId: string,
    message: string,
  ): Promise<ModerationCase>;
  appealById(caseId: string, actorId: string, message: string): Promise<ModerationCase>;
  setState(caseId: string, state: ModerationCaseState): Promise<void>;
}
