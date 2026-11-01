import type { CommandUsageInput, CommandUsageStore } from "@keystone/kernel";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { commandUsage } from "./schema";
import type { schema } from "./schema";

/**
 * Postgres write adapter for command usage.
 *
 * There is deliberately no update or delete path: a command invocation is an
 * append-only fact. Analytics reads these rows in `DrizzleAnalyticsStore`.
 */
export class DrizzleCommandUsageStore implements CommandUsageStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async record(input: CommandUsageInput): Promise<void> {
    await this.db.insert(commandUsage).values({
      guildId: input.guildId,
      command: input.command,
      path: input.path,
      status: input.status,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      createdAt: new Date(input.at),
    });
  }
}
