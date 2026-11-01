import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import type {
  IdempotencyStore,
  JobOptions,
  JobQueue,
  Logger,
  Telemetry,
} from "@keystone/kernel";
import { noopTelemetry } from "@keystone/kernel";

export interface JobContext {
  id: string;
  name: string;
  attempt: number;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<void>;

/**
 * One policy object, used by the BullMQ producer/worker and by the in-process
 * driver. If these ever diverge, a passing test stops describing production.
 */
export interface RetryPolicy {
  /** Total attempts, including the first. */
  maxAttempts: number;
  /** Base delay; attempt n waits backoffMs * 2^(n-1). */
  backoffMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, backoffMs: 250 };

export function backoffFor(policy: RetryPolicy, attempt: number): number {
  return policy.backoffMs * 2 ** Math.max(0, attempt - 1);
}

/** Redis URLs are the config format; BullMQ wants discrete fields. */
export function connectionFromUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    // Required by BullMQ workers: a blocked connection must not error out.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/** Log-safe Redis URL. Never let a password reach a log or an error message. */
export function redactRedisUrl(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<invalid redis url>";
  }
}

/**
 * Fail before announcing readiness.
 *
 * BullMQ connects lazily, so `new Worker(...)` succeeds even when Redis is down
 * and the process only fails later on an error event. A bounded ping here turns
 * that into one clear startup error with a redacted URL.
 */
export async function assertRedisReachable(
  redisUrl: string,
  timeoutMs = 5_000,
): Promise<void> {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on("error", () => undefined);

  let timer: NodeJS.Timeout | undefined;
  try {
    await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Redis ping timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    if (pong !== "PONG") throw new Error(`Unexpected Redis reply: ${String(pong)}`);
  } finally {
    if (timer) clearTimeout(timer);
    client.disconnect();
  }
}

/**
 * Retry policy in one place. The in-process driver and BullMQ must behave the
 * same way, or a test that passes locally would not describe production.
 */
export function retryOptions(
  options: JobOptions | undefined,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): JobsOptions {
  return {
    jobId: options?.idempotencyKey,
    delay: options?.delayMs,
    attempts: policy.maxAttempts,
    backoff: { type: "exponential", delay: policy.backoffMs },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 1_000 },
  };
}

interface JobData {
  payload: unknown;
  __traceparent?: string;
}

export class BullJobQueue implements JobQueue {
  constructor(
    private readonly queue: Queue<JobData>,
    private readonly telemetry: Telemetry = noopTelemetry,
    private readonly retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
  ) {}

  static create(options: {
    redisUrl: string;
    queueName: string;
    telemetry?: Telemetry;
    retryPolicy?: RetryPolicy;
  }): BullJobQueue {
    const queue = new Queue<JobData>(options.queueName, {
      connection: connectionFromUrl(options.redisUrl),
    });
    return new BullJobQueue(queue, options.telemetry, options.retryPolicy);
  }

  async enqueue(name: string, payload: unknown, options?: JobOptions): Promise<string> {
    return this.telemetry.withSpan("queue.enqueue", async () => {
      const data: JobData = { payload, __traceparent: this.telemetry.traceparent() };
      const job = await this.queue.add(name, data, retryOptions(options, this.retryPolicy));
      return job.id ?? options?.idempotencyKey ?? "unknown";
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export interface BullWorkerOptions {
  redisUrl: string;
  queueName: string;
  handlers: Readonly<Record<string, JobHandler>>;
  idempotency: IdempotencyStore;
  logger: Logger;
  telemetry?: Telemetry;
  retryPolicy?: RetryPolicy;
  concurrency?: number;
}

/**
 * The production consumer. Idempotency is checked before the handler and
 * completed after it, so a redelivered job that already finished is a no-op.
 * The `failed` listener writes the terminal failure once retries are exhausted.
 */
export function createBullWorker(options: BullWorkerOptions): Worker<JobData> {
  const telemetry = options.telemetry ?? noopTelemetry;
  const policy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;

  const worker = new Worker<JobData>(
    options.queueName,
    async (job) => {
      const handler = options.handlers[job.name];
      if (!handler) throw new Error(`No handler registered for job "${job.name}"`);

      const key = job.id ?? `${job.name}:${job.timestamp}`;
      if ((await options.idempotency.claim(key, job.name)) === "done") {
        options.logger.debug("job already completed — skipping", { job: key });
        return;
      }

      await telemetry.withRemoteParent(`job ${job.name}`, job.data.__traceparent, async () => {
        await handler(job.data.payload, {
          id: key,
          name: job.name,
          attempt: job.attemptsMade + 1,
        });
      });

      await options.idempotency.complete(key);
    },
    {
      connection: connectionFromUrl(options.redisUrl),
      concurrency: options.concurrency ?? 5,
    },
  );

  worker.on("failed", (job, error) => {
    if (!job) return;
    const key = job.id ?? `${job.name}:${job.timestamp}`;
    const attempts = job.opts.attempts ?? policy.maxAttempts;
    options.logger.warn("job attempt failed", {
      job: key,
      attempt: job.attemptsMade,
      attempts,
      error: error.message,
    });
    if (job.attemptsMade >= attempts) {
      void options.idempotency.fail(key, error.message).catch((writeError: unknown) => {
        options.logger.error("could not record failed job", {
          job: key,
          error: writeError instanceof Error ? writeError.message : String(writeError),
        });
      });
    }
  });

  worker.on("error", (error) => {
    options.logger.error("worker error", { error: error.message });
  });

  return worker;
}

export interface InProcessQueueOptions {
  idempotency: IdempotencyStore;
  telemetry?: Telemetry;
  logger?: Logger;
  retryPolicy?: RetryPolicy;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A real queue driver for environments without Redis (and for tests).
 *
 * It executes handlers, retries with exponential backoff, records terminal
 * failures and honours idempotency receipts — the same contract BullMQ gets.
 * It is deliberately not a stub: the tests that prove P1's retry behaviour run
 * this driver, and `BullJobQueue` shares `retryOptions` with it.
 */
export class InProcessJobQueue implements JobQueue {
  readonly #handlers = new Map<string, { handler: JobHandler }>();
  readonly #pending = new Set<Promise<void>>();
  #sequence = 0;

  constructor(private readonly options: InProcessQueueOptions) {}

  register(name: string, handler: JobHandler): this {
    this.#handlers.set(name, { handler });
    return this;
  }

  get retryPolicy(): RetryPolicy {
    return this.options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  }

  enqueue(name: string, payload: unknown, options?: JobOptions): Promise<string> {
    const telemetry = this.options.telemetry ?? noopTelemetry;
    return telemetry.withSpan("queue.enqueue", async () => {
      const id = options?.idempotencyKey ?? `${name}:${++this.#sequence}`;
      const traceparent = telemetry.traceparent();
      const run = this.#execute(name, id, payload, traceparent, options?.delayMs ?? 0);
      this.#pending.add(run);
      void run.finally(() => this.#pending.delete(run));
      return id;
    });
  }

  async drain(): Promise<void> {
    await Promise.all([...this.#pending]);
  }

  async close(): Promise<void> {
    await this.drain();
  }

  async #execute(
    name: string,
    id: string,
    payload: unknown,
    traceparent: string | undefined,
    delayMs: number,
  ): Promise<void> {
    const entry = this.#handlers.get(name);
    const logger = this.options.logger;
    const telemetry = this.options.telemetry ?? noopTelemetry;
    const idempotency = this.options.idempotency;

    if (!entry) {
      logger?.error("no handler registered for job", { job: name });
      await idempotency.claim(id, name);
      await idempotency.fail(id, `No handler registered for job "${name}"`);
      return;
    }

    if (delayMs > 0) await sleep(delayMs);

    let lastError: unknown;
    const policy = this.retryPolicy;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      if ((await idempotency.claim(id, name)) === "done") return;
      try {
        await telemetry.withRemoteParent(`job ${name}`, traceparent, async () => {
          await entry.handler(payload, { id, name, attempt });
        });
        await idempotency.complete(id);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < policy.maxAttempts) {
          await sleep(backoffFor(policy, attempt));
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    await idempotency.fail(id, message);
    logger?.error("job failed permanently", { job: id, name, error: message });
  }
}
