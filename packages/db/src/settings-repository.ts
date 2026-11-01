import { and, eq, notInArray, sql } from "drizzle-orm";
import { noopTelemetry } from "@keystone/kernel";
import type { SettingsRepository, Telemetry } from "@keystone/kernel";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { settings } from "./schema";
import type { schema } from "./schema";

/**
 * Postgres implementation of the P0 settings port.
 *
 * The interface is unchanged, which is exactly what P1 promised: every module
 * still talks to `SettingsService` and none of them knows this class exists.
 * Writes delete keys the module no longer declares, so a schema removal cannot
 * leave a ghost value behind.
 */
export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: PgDatabase<any, typeof schema>,
    private readonly telemetry: Telemetry = noopTelemetry,
  ) {}

  async get(guildId: string, moduleId: string): Promise<Record<string, unknown> | undefined> {
    return this.telemetry.withSpan("db.settings.get", async () => {
      // Read the JSON text and parse it exactly once. Drivers differ on whether
      // they hand back parsed JSON or raw text; going through ::text makes the
      // round-trip identical on PGlite and postgres.js, including JSON strings
      // that look like numbers.
      const rows = await this.db
        .select({ key: settings.key, value: sql<string | null>`${settings.value}::text` })
        .from(settings)
        .where(and(eq(settings.guildId, guildId), eq(settings.module, moduleId)));

      if (rows.length === 0) return undefined;
      return Object.fromEntries(
        rows.map((row) => [row.key, row.value === null ? null : JSON.parse(row.value)]),
      );
    });
  }

  async set(guildId: string, moduleId: string, value: Record<string, unknown>): Promise<void> {
    await this.telemetry.withSpan("db.settings.set", async () => {
      const keys = Object.keys(value);

      await this.db.transaction(async (tx) => {
        const scope = and(eq(settings.guildId, guildId), eq(settings.module, moduleId));
        await tx
          .delete(settings)
          .where(keys.length === 0 ? scope : and(scope, notInArray(settings.key, keys)));

        for (const key of keys) {
          await tx
            .insert(settings)
            .values({ guildId, module: moduleId, key, value: value[key] })
            .onConflictDoUpdate({
              target: [settings.guildId, settings.module, settings.key],
              set: { value: value[key], updatedAt: new Date() },
            });
        }
      });
    });
  }

  async clear(guildId: string, moduleId: string): Promise<void> {
    await this.telemetry.withSpan("db.settings.clear", async () => {
      await this.db
        .delete(settings)
        .where(and(eq(settings.guildId, guildId), eq(settings.module, moduleId)));
    });
  }
}
