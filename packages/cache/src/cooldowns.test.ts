import { describe, expect, it } from "vitest";
import type { Logger } from "@keystone/kernel";
import { createCooldownStore, RedisCooldownStore, type AtomicRedis } from "./index";

/**
 * A local stand-in for Redis's single-threaded command execution. `SET NX PX`
 * is one operation, so the check-and-set below runs without interleaving.
 */
class FakeRedis implements AtomicRedis {
  readonly #expiresAt = new Map<string, number>();

  async set(key: string, _value: string, _mode: "PX", ttl: number, _nx: "NX"): Promise<"OK" | null> {
    const expires = this.#expiresAt.get(key);
    if (expires !== undefined && expires > Date.now()) return null;
    this.#expiresAt.set(key, Date.now() + ttl);
    return "OK";
  }

  async pttl(key: string): Promise<number> {
    const expires = this.#expiresAt.get(key);
    return expires === undefined ? -2 : Math.max(-1, expires - Date.now());
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<unknown> {
    return "OK";
  }
}

function captureLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  const noop = () => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: (message) => warnings.push(message),
    error: noop,
    child: () => logger,
  };
  return { logger, warnings };
}

describe("RedisCooldownStore", () => {
  it("allows exactly one of many concurrent callers", async () => {
    const store = new RedisCooldownStore(new FakeRedis());
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.hit("diagnostics:ping:user-1", 1_000)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toHaveLength(49);
  });

  it("reports the remaining TTL instead of a fresh window", async () => {
    const store = new RedisCooldownStore(new FakeRedis());
    await store.hit("key", 5_000);
    const blocked = await store.hit("key", 5_000);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(4_000);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(5_000);
  });

  it("lets the caller through after the TTL expires", async () => {
    const store = new RedisCooldownStore(new FakeRedis());
    expect((await store.hit("key", 20)).allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect((await store.hit("key", 20)).allowed).toBe(true);
  });
});

describe("createCooldownStore", () => {
  it("falls back to memory only when Redis is unconfigured, and says so", async () => {
    const { logger, warnings } = captureLogger();
    const handle = await createCooldownStore({ logger });

    expect(handle.mode).toBe("memory");
    expect(warnings.join(" ")).toContain("process-local");

    expect((await handle.store.hit("key", 1_000)).allowed).toBe(true);
    expect((await handle.store.hit("key", 1_000)).allowed).toBe(false);
    await handle.close();
  });
});
