import { eq, sql } from "drizzle-orm";
import type { IdempotencyClaim, IdempotencyStore } from "@keystone/kernel";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { jobReceipts } from "./schema";
import type { schema } from "./schema";

export interface JobReceipt {
  idempotencyKey: string;
  jobName: string;
  status: string;
  attempts: number;
  lastError: string | null;
}

/**
 * Postgres receipts for queue work.
 *
 * `claim` is the important call: the first worker to insert wins, and a receipt
 * that is already `completed` makes the retry a no-op. A `claimed` receipt is
 * allowed to run again — delivery is at-least-once, so the handler must be
 * idempotent as well. Both halves of that contract are documented in
 * `06-Operations/` and tested in `packages/queue`.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async claim(key: string, jobName: string): Promise<IdempotencyClaim> {
    const inserted = await this.db
      .insert(jobReceipts)
      .values({ idempotencyKey: key, jobName, status: "claimed", attempts: 1 })
      .onConflictDoNothing()
      .returning({ key: jobReceipts.idempotencyKey });

    if (inserted.length > 0) return "run";

    const [existing] = await this.db
      .select()
      .from(jobReceipts)
      .where(eq(jobReceipts.idempotencyKey, key))
      .limit(1);

    if (!existing) return "run";
    if (existing.status === "completed") return "done";

    await this.db
      .update(jobReceipts)
      .set({
        status: "claimed",
        attempts: sql`${jobReceipts.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(jobReceipts.idempotencyKey, key));

    return "run";
  }

  async complete(key: string): Promise<void> {
    await this.db
      .update(jobReceipts)
      .set({ status: "completed", lastError: null, updatedAt: new Date() })
      .where(eq(jobReceipts.idempotencyKey, key));
  }

  async fail(key: string, error: string): Promise<void> {
    await this.db
      .update(jobReceipts)
      .set({ status: "failed", lastError: error.slice(0, 2_000), updatedAt: new Date() })
      .where(eq(jobReceipts.idempotencyKey, key));
  }

  async receipt(key: string): Promise<JobReceipt | undefined> {
    const [row] = await this.db
      .select({
        idempotencyKey: jobReceipts.idempotencyKey,
        jobName: jobReceipts.jobName,
        status: jobReceipts.status,
        attempts: jobReceipts.attempts,
        lastError: jobReceipts.lastError,
      })
      .from(jobReceipts)
      .where(eq(jobReceipts.idempotencyKey, key))
      .limit(1);
    return row;
  }
}
