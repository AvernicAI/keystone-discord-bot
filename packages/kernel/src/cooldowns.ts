import type { CooldownResult, CooldownStore } from "./types";

/**
 * Process-local cooldowns. Correct for one process and honest about it: it
 * resets on restart and is not shared across shards. P1's Redis adapter exists
 * precisely to replace this, and `/setup` reports which one is in use.
 */
export class InMemoryCooldownStore implements CooldownStore {
  readonly #readyAt = new Map<string, number>();

  async hit(key: string, ttlMs: number, now: number = Date.now()): Promise<CooldownResult> {
    const readyAt = this.#readyAt.get(key) ?? 0;
    if (readyAt > now) {
      return { allowed: false, retryAfterMs: readyAt - now };
    }
    this.#readyAt.set(key, now + ttlMs);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Test helper: forget every recorded hit. */
  clear(): void {
    this.#readyAt.clear();
  }
}
