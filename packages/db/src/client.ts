import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";
import type { SqlRunner } from "./migrator";

/**
 * The production driver. PGlite (tests) and postgres.js both produce a
 * `PgDatabase`; repositories accept the shared base type, not this alias.
 */
export type PostgresDatabase = PostgresJsDatabase<typeof schema>;

export interface PostgresHandle {
  db: PostgresDatabase;
  runner: SqlRunner;
  close(): Promise<void>;
}

export function createPostgresDatabase(url: string): PostgresHandle {
  const client = postgres(url, {
    max: 10,
    // Keep boot logs readable; query errors still throw.
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });

  return {
    db,
    runner: {
      async exec(statement: string): Promise<void> {
        await client.unsafe(statement);
      },
      async query<T = Record<string, unknown>>(statement: string): Promise<T[]> {
        const rows = await client.unsafe(statement);
        return rows as unknown as T[];
      },
    },
    async close(): Promise<void> {
      await client.end({ timeout: 5 });
    },
  };
}
