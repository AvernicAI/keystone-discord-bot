import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  ModmailAppendResult,
  ModmailCloseInput,
  ModmailCreateResult,
  ModmailMessage,
  ModmailSide,
  ModmailState,
  ModmailStats,
  ModmailStore,
  ModmailThread,
  ModmailThreadFilter,
  NewModmailMessage,
  NewModmailThread,
} from "@keystone/kernel";
import { modmailMessages, modmailThreads } from "./schema";
import type { schema } from "./schema";

type ThreadRow = typeof modmailThreads.$inferSelect;
type MessageRow = typeof modmailMessages.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toThread(row: ThreadRow): ModmailThread {
  return {
    id: row.id,
    guildId: row.guildId,
    ownerId: row.ownerId,
    subject: row.subject,
    state: row.state as ModmailState,
    claimedBy: row.claimedBy ?? undefined,
    claimedAt: row.claimedAt?.toISOString(),
    closedBy: row.closedBy ?? undefined,
    closedAt: row.closedAt?.toISOString(),
    resolution: row.resolution ?? undefined,
    memberUnread: row.memberUnread,
    staffUnread: row.staffUnread,
    messageCount: row.messageCount,
    transcript: row.transcript ?? undefined,
    transcriptChecksum: row.transcriptChecksum ?? undefined,
    transcriptMessageCount: row.transcriptMessageCount ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: MessageRow): ModmailMessage {
  return {
    id: row.id,
    guildId: row.guildId,
    threadId: row.threadId,
    authorId: row.authorId,
    side: row.side as ModmailSide,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The error code a unique index raises, wherever the driver nested it. */
function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cursor: unknown = error;
  while (cursor && typeof cursor === "object" && !seen.has(cursor)) {
    seen.add(cursor);
    if ((cursor as { code?: string }).code === "23505") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Postgres adapter for private modmail.
 *
 * `createThread` and `appendMessage` run in transactions: the thread row is
 * locked before a message is appended so unread counters and the first staff
 * claim cannot race. `closeThread` is a single conditional update — it only
 * matches a thread whose state is not already `closed`, so a duplicate close
 * writes nothing and returns undefined.
 */
export class DrizzleModmailStore implements ModmailStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async createThread(input: NewModmailThread): Promise<ModmailCreateResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [thread] = await tx
          .insert(modmailThreads)
          .values({
            guildId: input.guildId,
            ownerId: input.ownerId,
            subject: input.subject,
            state: "open",
            memberUnread: 0,
            staffUnread: 1,
            messageCount: 1,
          })
          .returning();
        if (!thread) throw new Error("Could not create the modmail thread");

        await tx.insert(modmailMessages).values({
          guildId: input.guildId,
          threadId: thread.id,
          authorId: input.authorId,
          side: "member",
          body: input.body,
        });
        return { ok: true as const, thread: toThread(thread) };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const active = await this.getActiveThread(input.guildId, input.ownerId);
      if (active) return { ok: false as const, reason: "active-exists" as const, thread: active };
      throw error;
    }
  }

  async getThread(guildId: string, threadId: string): Promise<ModmailThread | undefined> {
    if (!UUID.test(threadId)) return undefined;
    const [row] = await this.db
      .select()
      .from(modmailThreads)
      .where(and(eq(modmailThreads.guildId, guildId), eq(modmailThreads.id, threadId)))
      .limit(1);
    return row ? toThread(row) : undefined;
  }

  async getActiveThread(
    guildId: string,
    ownerId: string,
  ): Promise<ModmailThread | undefined> {
    const [row] = await this.db
      .select()
      .from(modmailThreads)
      .where(
        and(
          eq(modmailThreads.guildId, guildId),
          eq(modmailThreads.ownerId, ownerId),
          ne(modmailThreads.state, "closed"),
        ),
      )
      .limit(1);
    return row ? toThread(row) : undefined;
  }

  async listThreads(
    guildId: string,
    filter: ModmailThreadFilter = {},
  ): Promise<ModmailThread[]> {
    const conditions = [eq(modmailThreads.guildId, guildId)];
    if (filter.state) conditions.push(eq(modmailThreads.state, filter.state));
    if (filter.ownerId) conditions.push(eq(modmailThreads.ownerId, filter.ownerId));
    const rows = await this.db
      .select()
      .from(modmailThreads)
      .where(and(...conditions))
      .orderBy(desc(modmailThreads.updatedAt))
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));
    return rows.map(toThread);
  }

  async appendMessage(input: NewModmailMessage): Promise<ModmailAppendResult> {
    if (!UUID.test(input.threadId)) throw new Error("Thread not found");
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(modmailThreads)
        .where(
          and(
            eq(modmailThreads.guildId, input.guildId),
            eq(modmailThreads.id, input.threadId),
          ),
        )
        .limit(1)
        .for("update");
      if (!current) throw new Error("Thread not found");
      if (current.state === "closed") return { ok: false as const, reason: "closed" as const };

      const at = new Date();
      const [message] = await tx
        .insert(modmailMessages)
        .values({
          guildId: input.guildId,
          threadId: input.threadId,
          authorId: input.authorId,
          side: input.side,
          body: input.body,
        })
        .returning();
      if (!message) throw new Error("Could not append the modmail message");

      const claiming = current.state === "open" && input.side === "staff";
      const [thread] = await tx
        .update(modmailThreads)
        .set({
          state: claiming ? "claimed" : current.state,
          ...(claiming ? { claimedBy: input.authorId, claimedAt: at } : {}),
          messageCount: sql`${modmailThreads.messageCount} + 1`,
          staffUnread:
            input.side === "member"
              ? sql`${modmailThreads.staffUnread} + 1`
              : modmailThreads.staffUnread,
          memberUnread:
            input.side === "staff"
              ? sql`${modmailThreads.memberUnread} + 1`
              : modmailThreads.memberUnread,
          updatedAt: at,
        })
        .where(eq(modmailThreads.id, input.threadId))
        .returning();
      if (!thread) throw new Error("Could not update the modmail thread");
      return { ok: true as const, message: toMessage(message), thread: toThread(thread) };
    });
  }

  async listMessages(
    guildId: string,
    threadId: string,
    limit = 200,
  ): Promise<ModmailMessage[]> {
    if (!UUID.test(threadId)) return [];
    const rows = await this.db
      .select()
      .from(modmailMessages)
      .where(
        and(
          eq(modmailMessages.guildId, guildId),
          eq(modmailMessages.threadId, threadId),
        ),
      )
      .orderBy(modmailMessages.createdAt)
      .limit(Math.min(Math.max(limit, 1), 1_000));
    return rows.map(toMessage);
  }

  async closeThread(input: ModmailCloseInput): Promise<ModmailThread | undefined> {
    if (!UUID.test(input.threadId)) return undefined;
    const at = new Date(input.at);
    const [row] = await this.db
      .update(modmailThreads)
      .set({
        state: "closed",
        closedBy: input.closedBy,
        closedAt: at,
        resolution: input.resolution ?? null,
        transcript: input.transcript,
        transcriptChecksum: input.transcriptChecksum,
        transcriptMessageCount: input.transcriptMessageCount,
        memberUnread: 0,
        staffUnread: 0,
        updatedAt: at,
      })
      .where(
        and(
          eq(modmailThreads.guildId, input.guildId),
          eq(modmailThreads.id, input.threadId),
          ne(modmailThreads.state, "closed"),
        ),
      )
      .returning();
    return row ? toThread(row) : undefined;
  }

  async markRead(guildId: string, threadId: string, side: ModmailSide): Promise<boolean> {
    if (!UUID.test(threadId)) return false;
    const rows = await this.db
      .update(modmailThreads)
      .set(
        side === "member"
          ? { memberUnread: 0, updatedAt: new Date() }
          : { staffUnread: 0, updatedAt: new Date() },
      )
      .where(
        and(eq(modmailThreads.guildId, guildId), eq(modmailThreads.id, threadId)),
      )
      .returning({ id: modmailThreads.id });
    return rows.length > 0;
  }

  async stats(guildId: string): Promise<ModmailStats> {
    const [states, messages, unread] = await Promise.all([
      this.db
        .select({ state: modmailThreads.state, count: sql<number>`count(*)` })
        .from(modmailThreads)
        .where(eq(modmailThreads.guildId, guildId))
        .groupBy(modmailThreads.state),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(modmailMessages)
        .where(eq(modmailMessages.guildId, guildId)),
      this.db
        .select({ count: sql<number>`coalesce(sum(${modmailThreads.staffUnread}), 0)` })
        .from(modmailThreads)
        .where(eq(modmailThreads.guildId, guildId)),
    ]);

    const byState = new Map(states.map((row) => [row.state, Number(row.count)]));
    const open = byState.get("open") ?? 0;
    const claimed = byState.get("claimed") ?? 0;
    const closed = byState.get("closed") ?? 0;
    return {
      total: open + claimed + closed,
      open,
      claimed,
      closed,
      messages: Number(messages[0]?.count ?? 0),
      staffUnread: Number(unread[0]?.count ?? 0),
    };
  }
}
