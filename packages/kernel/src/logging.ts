/**
 * Structural audit-log types. No discord.js, no Drizzle, no network.
 *
 * Logging is deliberately an append-only stream: an event is recorded first and
 * delivery to the operator's channel is best-effort. A deleted log channel must
 * not lose the audit trail, and a disabled module must not write a row at all.
 */

export const LOG_EVENT_KINDS = [
  "message_delete",
  "message_edit",
  "member_join",
  "member_leave",
  "moderation_action",
] as const;

export type LogEventKind = (typeof LOG_EVENT_KINDS)[number];

export interface LogEventInput {
  readonly guildId: string;
  readonly kind: LogEventKind;
  readonly actorId?: string;
  /** The member, message or case the event describes. */
  readonly targetId?: string;
  readonly channelId?: string;
  readonly messageId?: string;
  /** One short description rendered as the embed description or reason. */
  readonly summary: string;
  /** Event-specific fields. Values are JSON-serialisable and bounded by the adapter. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Event time in milliseconds. Retention is based on this, not the insert time. */
  readonly at: number;
}

export interface LogEventRecord extends Omit<LogEventInput, "at" | "data"> {
  readonly id: string;
  readonly createdAt: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The narrow persistence port the logging module owns. */
export interface LoggingStore {
  append(input: LogEventInput): Promise<LogEventRecord>;
  /** Newest first, capped by the store. */
  list(guildId: string, limit: number): Promise<LogEventRecord[]>;
  count(guildId: string): Promise<number>;
  /** Delete events older than `before` and return how many rows were removed. */
  prune(guildId: string, before: string): Promise<number>;
}

export interface LoggingNotice {
  content?: string;
  embeds?: import("./types").EmbedPayload[];
}

export interface LoggingActionResult {
  readonly ok: boolean;
  readonly detail?: string;
}

/** The narrow side effect the module needs: one message in the log channel. */
export interface LoggingActions {
  send(guildId: string, channelId: string, notice: LoggingNotice): Promise<LoggingActionResult>;
}

export interface LoggingPort {
  readonly store: LoggingStore;
  readonly actions: LoggingActions;
}
