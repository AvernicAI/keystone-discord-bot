import { desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { DashboardOverview, DashboardStore } from "@keystone/kernel";
import { emptyGuildCounts } from "@keystone/kernel";
import { backups, cases, guilds, imports, levels, tickets } from "./schema";
import type { schema } from "./schema";

const count = sql<number>`count(*)::int`;

/**
 * Read model for the dashboard.
 *
 * It is deliberately a small, guild-scoped query surface, not a general query
 * escape hatch. Settings are read through `SettingsService`; this store only
 * answers the aggregate questions the overview needs. Every query carries the
 * guild id, and the caller has already passed the OAuth/bot authorization gate.
 */
export class DrizzleDashboardStore implements DashboardStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async overview(guildId: string): Promise<DashboardOverview> {
    const [guildRow, caseCount, ticketCount, levelCount, importCount, backupCount, latest] =
      await Promise.all([
        this.db
          .select({ name: guilds.name, joinedAt: guilds.joinedAt })
          .from(guilds)
          .where(eq(guilds.id, guildId))
          .limit(1),
        this.db.select({ value: count }).from(cases).where(eq(cases.guildId, guildId)),
        this.db
          .select({ value: count })
          .from(tickets)
          .where(sql`${tickets.guildId} = ${guildId} AND ${tickets.state} = 'open'`),
        this.db.select({ value: count }).from(levels).where(eq(levels.guildId, guildId)),
        this.db.select({ value: count }).from(imports).where(eq(imports.guildId, guildId)),
        this.db.select({ value: count }).from(backups).where(eq(backups.guildId, guildId)),
        this.db
          .select({
            id: imports.id,
            source: imports.source,
            state: imports.state,
            createdAt: imports.createdAt,
          })
          .from(imports)
          .where(eq(imports.guildId, guildId))
          .orderBy(desc(imports.createdAt))
          .limit(1),
      ]);

    return {
      guildId,
      name: guildRow[0]?.name ?? null,
      joinedAt: guildRow[0]?.joinedAt.toISOString() ?? null,
      counts: {
        ...emptyGuildCounts(),
        cases: Number(caseCount[0]?.value ?? 0),
        openTickets: Number(ticketCount[0]?.value ?? 0),
        levels: Number(levelCount[0]?.value ?? 0),
        imports: Number(importCount[0]?.value ?? 0),
        backups: Number(backupCount[0]?.value ?? 0),
      },
      latestImport: latest[0]
        ? {
            id: latest[0].id,
            source: latest[0].source,
            state: latest[0].state,
            createdAt: latest[0].createdAt.toISOString(),
          }
        : null,
    };
  }
}
