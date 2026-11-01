import { Redis } from "ioredis";
import { InMemoryCooldownStore } from "@keystone/kernel";
import type { CooldownResult, CooldownStore, Logger } from "@keystone/kernel";

/**
 * The two commands this adapter needs. Narrowing the surface keeps the atomic
 * semantics visible: `SET key 1 PX ttl NX` is a single Redis operation, so two
 * concurrent callers cannot both win. A read-then-write would not be safe.
 */
export interface AtomicRedis {
  set(key: string, value: string, mode: "PX", ttl: number, nx: "NX"): Promise<"OK" | null>;
  pttl(key: string): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export class RedisCooldownStore implements CooldownStore {
  constructor(
    private readonly redis: AtomicRedis,
    private readonly prefix = "keystone:cd:",
  ) {}

  async hit(key: string, ttlMs: number, _now?: number): Promise<CooldownResult> {
    const redisKey = `${this.prefix}${key}`;
    const ttl = Math.max(1, Math.ceil(ttlMs));
    const result = await this.redis.set(redisKey, "1", "PX", ttl, "NX");

    if (result === "OK") return { allowed: true, retryAfterMs: 0 };

    const remaining = await this.redis.pttl(redisKey);
    return { allowed: false, retryAfterMs: remaining > 0 ? remaining : ttl };
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export type CooldownMode = "redis" | "memory";

export interface CooldownHandle {
  store: CooldownStore;
  mode: CooldownMode;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface CooldownOptions {
  redisUrl?: string;
  logger: Logger;
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Choose the cooldown backend once, in the composition root.
 *
 * Unconfigured Redis is a supported mode and is logged loudly. Configured but
 * unreachable Redis is *not* silently downgraded: that would hide a production
 * outage behind cooldowns that stop working. The caller fails to boot instead.
 */
export async function createCooldownStore(options: CooldownOptions): Promise<CooldownHandle> {
  if (!options.redisUrl) {
    options.logger.warn(
      "REDIS_URL is not set — cooldowns are process-local: they reset on restart and are not shared across processes. See 06-Operations/Redis.md.",
    );
    return {
      store: new InMemoryCooldownStore(),
      mode: "memory",
      async ping() {
        return false;
      },
      async close() {
        /* nothing to close */
      },
    };
  }

  const redis = new Redis(options.redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  const store = new RedisCooldownStore(redis as unknown as AtomicRedis);

  try {
    await timeout(redis.ping(), 5_000, "Redis ping");
  } catch (error) {
    await redis.quit().catch(() => undefined);
    throw new Error(
      `REDIS_URL is set but Redis is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  options.logger.info("cooldowns: redis", { shared: true });
  return {
    store,
    mode: "redis",
    ping: () => store.ping(),
    close: () => store.close(),
  };
}
