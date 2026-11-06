import { Redis } from "ioredis";
import type {
  Logger,
  MusicControlBus,
  MusicControlReply,
  MusicControlRequest,
  MusicControlState,
} from "@keystone/kernel";

const PREFIX = "keystone:music";
const REQUEST_TTL_SECONDS = 60;
const REPLY_TTL_SECONDS = 30;
const STATE_TTL_SECONDS = 90;
const REQUEST_TIMEOUT_MS = 8_000;

function stateKey(guildId: string): string {
  return `${PREFIX}:state:${guildId}`;
}

function replyKey(id: string): string {
  return `${PREFIX}:reply:${id}`;
}

const REQUEST_QUEUE = `${PREFIX}:requests`;
const HEARTBEAT_KEY = `${PREFIX}:heartbeat`;

function offline(): MusicControlReply {
  return {
    ok: false,
    code: "bot_offline",
    message:
      "The bot did not answer. It may be offline, or REDIS_URL may point at a different Redis than the bot uses.",
  };
}

function parseReply(raw: string | null): MusicControlReply {
  if (!raw) return offline();
  try {
    const parsed = JSON.parse(raw) as Partial<MusicControlReply>;
    if (typeof parsed.ok === "boolean" && typeof parsed.message === "string") {
      return {
        ok: parsed.ok,
        message: parsed.message,
        ...(parsed.code ? { code: parsed.code } : {}),
      };
    }
  } catch {
    /* fall through */
  }
  return {
    ok: false,
    code: "reply_invalid",
    message: "The bot sent a reply this process could not read.",
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * Redis request/reply for the dashboard remote.
 *
 * The bot owns the voice socket and the queue; the web process never gets a
 * Discord client. A dashboard control is one JSON request on a Redis list, a
 * reply in a short-lived key, and a state snapshot refreshed by the bot. If the
 * bot is not running the request times out with a named `bot_offline`, not a
 * spinner or a fake success.
 */
export class RedisMusicControlBus implements MusicControlBus {
  #serving = false;
  #receiver?: Redis;

  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  async publishState(state: MusicControlState): Promise<void> {
    await this.redis.set(
      stateKey(state.guildId),
      JSON.stringify(state),
      "EX",
      STATE_TTL_SECONDS,
    );
  }

  async readState(guildId: string): Promise<MusicControlState | undefined> {
    const raw = await this.redis.get(stateKey(guildId));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as MusicControlState;
      if (typeof parsed.guildId !== "string" || !parsed.node || !parsed.queue) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  async publishHeartbeat(at: string): Promise<void> {
    await this.redis.set(HEARTBEAT_KEY, at, "EX", 15);
  }

  async readHeartbeat(): Promise<string | undefined> {
    return (await this.redis.get(HEARTBEAT_KEY)) ?? undefined;
  }

  async request(request: MusicControlRequest): Promise<MusicControlReply> {
    await this.redis.set(
      replyKey(request.id),
      JSON.stringify({ ok: false, code: "pending", message: "pending" }),
      "EX",
      REQUEST_TTL_SECONDS,
    );
    await this.redis.rpush(REQUEST_QUEUE, JSON.stringify(request));
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const raw = await this.redis.get(replyKey(request.id));
      if (raw) {
        const parsed = JSON.parse(raw) as MusicControlReply;
        if (parsed.code === "pending") {
          await sleep(100);
          continue;
        }
        await this.redis.del(replyKey(request.id));
        return parseReply(raw);
      }
      await sleep(100);
    }
    await this.redis.del(replyKey(request.id));
    return offline();
  }

  serve(handler: (request: MusicControlRequest) => Promise<MusicControlReply>): void {
    if (this.#serving) return;
    this.#serving = true;
    this.#receiver = this.redis.duplicate();
    void this.#loop(handler);
  }

  async #loop(
    handler: (request: MusicControlRequest) => Promise<MusicControlReply>,
  ): Promise<void> {
    while (this.#serving && this.#receiver) {
      try {
        const item = await this.#receiver.blpop(REQUEST_QUEUE, 2);
        if (!item) continue;
        const [, raw] = item;
        let request: MusicControlRequest;
        try {
          request = JSON.parse(raw) as MusicControlRequest;
          if (typeof request.id !== "string" || typeof request.guildId !== "string") {
            continue;
          }
        } catch {
          continue;
        }
        let reply: MusicControlReply;
        try {
          reply = await handler(request);
        } catch (error) {
          this.logger.warn("music control request failed", {
            guildId: request.guildId,
            action: request.action,
            error: error instanceof Error ? error.message : String(error),
          });
          reply = {
            ok: false,
            code: "control_failed",
            message: error instanceof Error ? error.message : "The bot could not run that control.",
          };
        }
        await this.redis.set(replyKey(request.id), JSON.stringify(reply), "EX", REPLY_TTL_SECONDS);
      } catch (error) {
        if (!this.#serving) return;
        this.logger.warn("music control loop error", {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(1_000);
      }
    }
  }

  async close(): Promise<void> {
    this.#serving = false;
    if (this.#receiver) await this.#receiver.quit().catch(() => undefined);
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * In-process implementation. It is real enough for tests and for a single
 * process that composes both surfaces; it is never used to fake a remote bot.
 */
export class InMemoryMusicControlBus implements MusicControlBus {
  readonly states = new Map<string, MusicControlState>();
  readonly requests: MusicControlRequest[] = [];
  #heartbeatValue?: string;
  #handler?: (request: MusicControlRequest) => Promise<MusicControlReply>;

  async publishState(state: MusicControlState): Promise<void> {
    this.states.set(state.guildId, state);
  }

  async readState(guildId: string): Promise<MusicControlState | undefined> {
    return this.states.get(guildId);
  }

  get heartbeat(): string | undefined {
    return this.#heartbeatValue;
  }

  async publishHeartbeat(at: string): Promise<void> {
    this.#heartbeatValue = at;
  }

  async readHeartbeat(): Promise<string | undefined> {
    return this.#heartbeatValue;
  }

  async request(request: MusicControlRequest): Promise<MusicControlReply> {
    this.requests.push(request);
    if (!this.#handler) return offline();
    try {
      return await this.#handler(request);
    } catch (error) {
      return {
        ok: false,
        code: "control_failed",
        message: error instanceof Error ? error.message : "The bot could not run that control.",
      };
    }
  }

  serve(handler: (request: MusicControlRequest) => Promise<MusicControlReply>): void {
    this.#handler = handler;
  }

  async close(): Promise<void> {
    this.#handler = undefined;
  }
}

export interface MusicControlHandle {
  readonly bus: MusicControlBus;
  readonly mode: "redis" | "memory";
  close(): Promise<void>;
}

/**
 * Redis is the only cross-process bus. Without REDIS_URL there is no remote
 * control, and the dashboard says that instead of pretending to be one.
 */
export async function createMusicControlBus(options: {
  redisUrl?: string;
  logger: Logger;
}): Promise<MusicControlHandle | undefined> {
  if (!options.redisUrl) return undefined;
  const redis = new Redis(options.redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  try {
    await redis.ping();
  } catch (error) {
    await redis.quit().catch(() => undefined);
    throw new Error(
      `REDIS_URL is set but Redis is unreachable for music control: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const bus = new RedisMusicControlBus(redis, options.logger);
  return {
    bus,
    mode: "redis",
    close: () => bus.close(),
  };
}
