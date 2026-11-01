import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  InviteJoinInput,
  InviteJoinRecord,
  InviteLeaderboardRow,
  InviteStore,
} from "@keystone/kernel";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { inviteJoins } from "./schema";
import type { schema } from "./schema";

type JoinRow = typeof inviteJoins.$inferSelect;

function toRecord(row: JoinRow): InviteJoinRecord {
  return {
    guildId: row.guildId,
    userId: row.userId,
    inviterId: row.inviterId ?? undefined,
    code: row.code ?? undefined,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt?.toISOString(),
    fakeReasons: Array.isArray(row.fakeReasons) ? (row.fakeReasons as string[]) : [],
  };
}

function toRow(rows: {
  inviterId: string | null;
  joins: number | string;
  leaves: number | string;
}[]): InviteLeaderboardRow[] {
  return rows.flatMap((row) => {
    if (!row.inviterId) return [];
    const joins = Number(row.joins);
    const leaves = Number(row.leaves);
    return [{ inviterId: row.inviterId, joins, leaves, retained: joins - leaves }];
  });
}

/**
 * Postgres adapter for invite tracking.
 *
 * Counts are computed in SQL, not by loading every join into the bot process.
 * The unique key makes a repeated gateway event a no-op, and `left_at` is set on
 * the newest open row so a member who leaves and rejoins keeps both joins.
 */
export class DrizzleInviteStore implements InviteStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async recordJoin(input: InviteJoinInput): Promise<boolean> {
    const inserted = await this.db
      .insert(inviteJoins)
      .values({
        guildId: input.guildId,
        userId: input.userId,
        inviterId: input.inviterId ?? null,
        code: input.code ?? null,
        joinedAt: new Date(input.joinedAt),
        fakeReasons: [...(input.fakeReasons ?? [])],
      })
      .onConflictDoNothing({
        target: [inviteJoins.guildId, inviteJoins.userId, inviteJoins.joinedAt],
      })
      .returning({ id: inviteJoins.id });
    return inserted.length > 0;
  }

  async recordLeave(guildId: string, userId: string, leftAt: string): Promise<boolean> {
    const [open] = await this.db
      .select({ id: inviteJoins.id })
      .from(inviteJoins)
      .where(
        and(
          eq(inviteJoins.guildId, guildId),
          eq(inviteJoins.userId, userId),
          isNull(inviteJoins.leftAt),
        ),
      )
      .orderBy(desc(inviteJoins.joinedAt))
      .limit(1);
    if (!open) return false;

    await this.db
      .update(inviteJoins)
      .set({ leftAt: new Date(leftAt) })
      .where(eq(inviteJoins.id, open.id));
    return true;
  }

  async leaderboard(guildId: string, limit: number): Promise<InviteLeaderboardRow[]> {
    const rows = await this.db
      .select({
        inviterId: inviteJoins.inviterId,
        joins: sql<number>`count(*)`,
        leaves: sql<number>`count(${inviteJoins.leftAt})`,
      })
      .from(inviteJoins)
      .where(and(eq(inviteJoins.guildId, guildId), isNotNull(inviteJoins.inviterId)))
      .groupBy(inviteJoins.inviterId)
      .orderBy(
        desc(sql`count(*) - count(${inviteJoins.leftAt})`),
        desc(sql`count(*)`),
        inviteJoins.inviterId,
      )
      .limit(Math.min(Math.max(limit, 1), 25));
    return toRow(rows);
  }

  async statsFor(
    guildId: string,
    inviterId: string,
  ): Promise<InviteLeaderboardRow | undefined> {
    const rows = await this.db
      .select({
        inviterId: inviteJoins.inviterId,
        joins: sql<number>`count(*)`,
        leaves: sql<number>`count(${inviteJoins.leftAt})`,
      })
      .from(inviteJoins)
      .where(and(eq(inviteJoins.guildId, guildId), eq(inviteJoins.inviterId, inviterId)))
      .groupBy(inviteJoins.inviterId);
    return toRow(rows)[0];
  }

  async invitee(guildId: string, userId: string): Promise<InviteJoinRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(inviteJoins)
      .where(
        and(
          eq(inviteJoins.guildId, guildId),
          eq(inviteJoins.userId, userId),
          isNotNull(inviteJoins.inviterId),
        ),
      )
      .orderBy(desc(inviteJoins.joinedAt))
      .limit(1);
    return row ? toRecord(row) : undefined;
  }
}
