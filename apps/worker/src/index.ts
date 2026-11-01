import "dotenv/config";
import { createLogger } from "@keystone/kernel";
import { loadEnv } from "@keystone/config";
import { createIdempotencyStore, createPostgresDatabase } from "@keystone/db";
import {
  assertRedisReachable,
  createBullWorker,
  redactRedisUrl,
  type JobHandler,
} from "@keystone/queue";
import { createOtlpTelemetry, createTelemetry } from "@keystone/telemetry";
import { createHandlers } from "./handlers";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger("keystone-worker", env.LOG_LEVEL);

  if (!env.DATABASE_URL || !env.REDIS_URL) {
    throw new Error(
      "The worker requires both DATABASE_URL and REDIS_URL. Without Redis, jobs run inside the bot process.",
    );
  }

  try {
    await assertRedisReachable(env.REDIS_URL);
  } catch (error) {
    const detail = error instanceof Error ? (error.message || error.name) : String(error);
    throw new Error(
      `Redis is configured but unreachable at ${redactRedisUrl(env.REDIS_URL)}: ${detail}`,
    );
  }

  const database = createPostgresDatabase(env.DATABASE_URL);
  const telemetry = env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? await createOtlpTelemetry(env.OTEL_EXPORTER_OTLP_ENDPOINT, "keystone-worker")
    : createTelemetry({ enabled: env.OTEL_ENABLED, serviceName: "keystone-worker" });

  const handlers: Record<string, JobHandler> = createHandlers(database);

  const worker = createBullWorker({
    redisUrl: env.REDIS_URL,
    queueName: env.QUEUE_NAME,
    handlers,
    idempotency: createIdempotencyStore(database),
    logger,
    telemetry,
  });

  logger.info("worker ready", {
    queue: env.QUEUE_NAME,
    handlers: Object.keys(handlers),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker shutting down", { signal });
    await worker.close();
    await database.close();
    await telemetry.shutdown();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
