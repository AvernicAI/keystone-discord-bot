import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { MemberStore, MemberVerification } from "@keystone/kernel";
import { members } from "./schema";
import type { schema } from "./schema";

type MemberRow = typeof members.$inferSelect;

function toMember(row: MemberRow): MemberVerification {
  return {
    guildId: row.guildId,
    userId: row.userId,
    joinedAt: row.joinedAt.toISOString(),
    quarantined: row.quarantined,
    verifiedAt: row.verifiedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Postgres implementation of the member-state port.
 *
 * The security coordinator writes the held state after an enforced
 * quarantine; the verify button writes the completion. Both are upserts over
 * one `(guild_id, user_id)` row, so `/verify status` answers from state instead
 * of asking the gateway which roles a member has.
 */
export class DrizzleMemberStore implements MemberStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async get(guildId: string, userId: string): Promise<MemberVerification | undefined> {
    const [row] = await this.db
      .select()
      .from(members)
      .where(and(eq(members.guildId, guildId), eq(members.userId, userId)))
      .limit(1);
    return row ? toMember(row) : undefined;
  }

  async markQuarantined(
    guildId: string,
    userId: string,
  ): Promise<MemberVerification> {
    const [row] = await this.db
      .insert(members)
      .values({
        guildId,
        userId,
        quarantined: true,
      })
      .onConflictDoUpdate({
        target: [members.guildId, members.userId],
        set: {
          quarantined: true,
          verifiedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) throw new Error("Could not record member quarantine");
    return toMember(row);
  }

  async markVerified(
    guildId: string,
    userId: string,
    verifiedAt: string,
  ): Promise<MemberVerification> {
    const [row] = await this.db
      .insert(members)
      .values({
        guildId,
        userId,
        quarantined: false,
        verifiedAt: new Date(verifiedAt),
      })
      .onConflictDoUpdate({
        target: [members.guildId, members.userId],
        set: {
          quarantined: false,
          verifiedAt: new Date(verifiedAt),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) throw new Error("Could not record member verification");
    return toMember(row);
  }
}
