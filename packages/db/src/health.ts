import type { HealthArea } from "@keystone/kernel";
import { migrationStatus, type SqlRunner } from "./migrator";

/**
 * Database readiness for `/setup`: reachable, and are the migrations applied?
 * It never runs migrations — that is an explicit operator step.
 */
export async function probeDatabase(
  runner: SqlRunner | undefined,
): Promise<HealthArea & { migrated: boolean }> {
  if (!runner) {
    return {
      configured: false,
      reachable: false,
      migrated: false,
      detail: "DATABASE_URL is not set — settings are process-local",
    };
  }

  try {
    await runner.query("SELECT 1 AS ok");
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      migrated: false,
      detail: error instanceof Error ? error.message.slice(0, 200) : String(error),
    };
  }

  try {
    const status = await migrationStatus(runner);
    return {
      configured: true,
      reachable: true,
      migrated: status.upToDate,
      detail: status.upToDate
        ? "schema up to date"
        : `${status.pending.length} pending migration(s) — run pnpm db:migrate`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: true,
      migrated: false,
      detail: error instanceof Error ? error.message.slice(0, 200) : String(error),
    };
  }
}
