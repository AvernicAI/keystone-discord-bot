import {
  InMemoryIdempotencyStore,
  InMemorySettingsRepository,
  SettingsService,
  type CooldownStore,
  type HealthProbe,
  type HealthReport,
  type IdempotencyStore,
  type JobQueue,
  type Logger,
  type ModuleRegistry,
  type SettingsRepository,
  type Telemetry,
  type ModerationActions,
  type ModerationPort,
  type CommunityActions,
  type CommunityPort,
  type AiPort,
} from "@keystone/kernel";
import type { Env } from "@keystone/config";
import {
  createIdempotencyStore,
  createCaseStore,
  createCommunityStore,
  createAiStore,
  createPostgresDatabase,
  createSettingsRepository,
  probeDatabase,
  type PostgresHandle,
} from "@keystone/db";
import {
  CaseService,
  InMemoryCaseStore,
  SecurityCoordinator,
  SecurityEngine,
} from "@keystone/module-moderation";
import { InMemoryCommunityStore } from "@keystone/module-community";
import { AiService, InMemoryAiStore, createAiProvider } from "@keystone/module-ai";
import { createCooldownStore, type CooldownHandle } from "@keystone/cache";
import { BullJobQueue, InProcessJobQueue } from "@keystone/queue";
import { createOtlpTelemetry, createTelemetry } from "@keystone/telemetry";

export type DatabaseMode = "postgres" | "memory";
export type CacheMode = "redis" | "memory";
export type QueueMode = "bullmq" | "in-process";

export interface Runtime {
  settings: SettingsService;
  cooldowns: CooldownStore;
  queue: JobQueue;
  health: HealthProbe;
  telemetry: Telemetry;
  moderation: ModerationPort;
  community: CommunityPort;
  ai: AiPort;
  security: SecurityCoordinator;
  mode: { database: DatabaseMode; cache: CacheMode; queue: QueueMode };
  close(): Promise<void>;
}

class RuntimeHealth implements HealthProbe {
  constructor(
    private readonly database: PostgresHandle | undefined,
    private readonly cache: CooldownHandle,
  ) {}

  async probe(): Promise<HealthReport> {
    const cache =
      this.cache.mode === "redis"
        ? { configured: true, reachable: await this.cache.ping(), detail: "redis" }
        : { configured: false, reachable: false, detail: "memory" };

    return { database: await probeDatabase(this.database?.runner), cache };
  }
}

/**
 * The composition root. This is the only function that decides *which*
 * implementation of each port a deployment gets; modules and the kernel keep
 * seeing interfaces.
 *
 * Every fallback is explicit and logged. A missing variable is a supported
 * local-development mode; a configured-but-broken service is an error.
 */
export async function createRuntime(
  env: Env,
  registry: ModuleRegistry,
  logger: Logger,
  moderationActions: ModerationActions,
  communityActions: CommunityActions,
): Promise<Runtime> {
  const telemetry = env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? await createOtlpTelemetry(env.OTEL_EXPORTER_OTLP_ENDPOINT, "keystone-bot")
    : createTelemetry({ enabled: env.OTEL_ENABLED, serviceName: "keystone-bot" });

  let database: PostgresHandle | undefined;
  let repository: SettingsRepository;
  let idempotency: IdempotencyStore;

  if (env.DATABASE_URL) {
    database = createPostgresDatabase(env.DATABASE_URL);
    repository = createSettingsRepository(database, telemetry);
    idempotency = createIdempotencyStore(database);
    logger.info("settings: postgres");
  } else {
    logger.warn(
      "DATABASE_URL is not set — settings are process-local and will reset on restart. Run docker compose up for the real thing.",
    );
    repository = new InMemorySettingsRepository();
    idempotency = new InMemoryIdempotencyStore();
  }

  const cache = await createCooldownStore({ redisUrl: env.REDIS_URL, logger });

  const settings = new SettingsService(repository, registry);
  const cases = new CaseService(
    database ? createCaseStore(database) : new InMemoryCaseStore(),
  );
  const moderation: ModerationPort = { cases, actions: moderationActions };
  const community: CommunityPort = {
    store: database ? createCommunityStore(database) : new InMemoryCommunityStore(),
    actions: communityActions,
  };
  const ai = new AiService(
    database ? createAiStore(database) : new InMemoryAiStore(),
    createAiProvider({
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      model: env.AI_MODEL,
      embeddingModel: env.AI_EMBEDDING_MODEL,
      inputUsdPerMillion: env.AI_INPUT_USD_PER_MILLION,
      outputUsdPerMillion: env.AI_OUTPUT_USD_PER_MILLION,
    }),
    settings.forModule("ai"),
  );
  const security = new SecurityCoordinator({
    engine: new SecurityEngine(),
    cases,
    actions: moderationActions,
    settings: settings.forModule("moderation"),
    logger: logger.child("security"),
  });

  let queue: JobQueue;
  if (env.REDIS_URL) {
    queue = BullJobQueue.create({
      redisUrl: env.REDIS_URL,
      queueName: env.QUEUE_NAME,
      telemetry,
    });
    logger.info("queue: bullmq", { queue: env.QUEUE_NAME });
  } else {
    logger.warn(
      "REDIS_URL is not set — jobs run in this process and are lost on restart. The worker requires Redis.",
    );
    queue = new InProcessJobQueue({ idempotency, telemetry, logger });
  }

  return {
    settings,
    cooldowns: cache.store,
    queue,
    health: new RuntimeHealth(database, cache),
    telemetry,
    moderation,
    community,
    ai,
    security,
    mode: {
      database: database ? "postgres" : "memory",
      cache: cache.mode,
      queue: env.REDIS_URL ? "bullmq" : "in-process",
    },
    async close() {
      await queue.close();
      await cache.close();
      await database?.close();
      await telemetry.shutdown();
    },
  };
}
