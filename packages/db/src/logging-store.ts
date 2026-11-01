import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  LogEventInput,
  LogEventRecord,
  LoggingStore,
} from "@keystone/kernel";
import { loggingEvents } from "./schema";
import type { schema } from "./schema";

type LogRow = typeof loggingEvents.$inferSelect;

function toRecord(row: LogRow): LogEventRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    kind: row.kind as LogEventRecord["kind"],
    actorId: row.actorId ?? undefined,
    targetId: row.targetId ?? undefined,
    channelId: row.channelId ?? undefined,
    messageId: row.messageId ?? undefined,
    summary: row.summary,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Postgres adapter for audit logging.
 *
 * Inserts are append-only; there is no update path. Retention is one indexed
 * DELETE keyed by `(guild_id, created_at)`, so pruning does not load the
 * ledger into the bot process.
 */
export class DrizzleLoggingStore implements LoggingStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async append(input: LogEventInput): Promise<LogEventRecord> {
    const [row] = await this.db
      .insert(loggingEvents)
      .values({
        guildId: input.guildId,
        kind: input.kind,
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        channelId: input.channelId ?? null,
        messageId: input.messageId ?? null,
        summary: input.summary,
        data: input.data ?? null,
        createdAt: new Date(input.at),
      })
      .returning();
    if (!row) throw new Error("Could not append a logging event");
    return toRecord(row);
  }

  async list(guildId: string, limit: number): Promise<LogEventRecord[]> {
    const rows = await this.db
      .select()
      .from(loggingEvents)
      .where(eq(loggingEvents.guildId, guildId))
      .orderBy(desc(loggingEvents.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toRecord);
  }

  async count(guildId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(loggingEvents)
      .where(eq(loggingEvents.guildId, guildId));
    return Number(row?.count ?? 0);
  }

  async prune(guildId: string, before: string): Promise<number> {
    const removed = await this.db
      .delete(loggingEvents)
      .where(
        and(
          eq(loggingEvents.guildId, guildId),
          lt(loggingEvents.createdAt, new Date(before)),
        ),
      )
      .returning({ id: loggingEvents.id });
    return removed.length;
  }
}
