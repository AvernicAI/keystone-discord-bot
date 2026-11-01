import { sql as migration0001, version as version0001 } from "./migrations/0001-init";
import { sql as migration0002, version as version0002 } from "./migrations/0002-settings-nullable";
import { sql as migration0003, version as version0003 } from "./migrations/0003-case-counters";
import { sql as migration0004, version as version0004 } from "./migrations/0004-community-records";
import { sql as migration0005, version as version0005 } from "./migrations/0005-ai-documents-usage";
import { sql as migration0006, version as version0006 } from "./migrations/0006-web-sessions";

/**
 * The smallest database surface a migrator needs. Both the production driver
 * (`postgres.js`) and the test driver (PGlite) implement it, which is why the
 * same migrations run in CI and in a container.
 */
export interface SqlRunner {
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
}

export interface Migration {
  version: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: version0001, sql: migration0001 },
  { version: version0002, sql: migration0002 },
  { version: version0003, sql: migration0003 },
  { version: version0004, sql: migration0004 },
  { version: version0005, sql: migration0005 },
  { version: version0006, sql: migration0006 },
];

const LEDGER = "schema_migrations";

function escape(value: string): string {
  return value.replaceAll("'", "''");
}

export async function ensureLedger(runner: SqlRunner): Promise<void> {
  await runner.exec(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

/**
 * Explicit, ordered, idempotent migrations.
 *
 * There is deliberately no "run this on boot" path: two replicas starting at
 * once would race, and a failed migration would leave a half-started bot. The
 * operator runs `pnpm db:migrate` (or the compose `migrate` service) first.
 */
export async function migrate(
  runner: SqlRunner,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  await ensureLedger(runner);

  const rows = await runner.query<{ version: string }>(`SELECT version FROM ${LEDGER}`);
  const applied = new Set(rows.map((row) => row.version));
  const appliedNow: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      alreadyApplied.push(migration.version);
      continue;
    }

    await runner.exec("BEGIN");
    try {
      await runner.exec(migration.sql);
      await runner.exec(
        `INSERT INTO ${LEDGER} (version) VALUES ('${escape(migration.version)}')`,
      );
      await runner.exec("COMMIT");
    } catch (error) {
      await runner.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.version} failed and was rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    appliedNow.push(migration.version);
  }

  return { applied: appliedNow, alreadyApplied };
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  upToDate: boolean;
}

export async function migrationStatus(
  runner: SqlRunner,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationStatus> {
  await ensureLedger(runner);
  const rows = await runner.query<{ version: string }>(`SELECT version FROM ${LEDGER}`);
  const applied = new Set(rows.map((row) => row.version));
  const pending = migrations.filter((migration) => !applied.has(migration.version)).map((m) => m.version);
  return { applied: [...applied].sort(), pending, upToDate: pending.length === 0 };
}
