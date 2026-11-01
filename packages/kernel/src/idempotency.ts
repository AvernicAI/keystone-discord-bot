import type { IdempotencyClaim, IdempotencyStore } from "./types";

/**
 * Receipts for a queue with no database (local development). The interface is
 * the same as Postgres's, so the queue and its tests do not branch on which one
 * is in use.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly #rows = new Map<
    string,
    { jobName: string; status: "claimed" | "completed" | "failed"; attempts: number; lastError: string | null }
  >();

  async claim(key: string, jobName: string): Promise<IdempotencyClaim> {
    const row = this.#rows.get(key);
    if (!row) {
      this.#rows.set(key, { jobName, status: "claimed", attempts: 1, lastError: null });
      return "run";
    }
    if (row.status === "completed") return "done";
    row.status = "claimed";
    row.attempts += 1;
    return "run";
  }

  async complete(key: string): Promise<void> {
    const row = this.#rows.get(key);
    if (row) {
      row.status = "completed";
      row.lastError = null;
    }
  }

  async fail(key: string, error: string): Promise<void> {
    const row = this.#rows.get(key);
    if (row) {
      row.status = "failed";
      row.lastError = error;
    }
  }

  receipt(key: string):
    | { jobName: string; status: string; attempts: number; lastError: string | null }
    | undefined {
    const row = this.#rows.get(key);
    return row ? { ...row } : undefined;
  }
}
