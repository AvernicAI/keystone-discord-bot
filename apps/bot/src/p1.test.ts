import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryCooldownStore,
  ModuleRegistry,
  SettingsService,
  defineCommand,
  defineModule,
  dispatchCommand,
} from "@keystone/kernel";
import { DrizzleSettingsRepository, PostgresIdempotencyStore } from "@keystone/db";
import { createMigratedPglite, type PgliteHarness } from "@keystone/db/testing";
import { InProcessJobQueue } from "@keystone/queue";
import { createTestTelemetry, type TestTelemetry } from "@keystone/telemetry";
import { FakeInteraction, staticHealth } from "@keystone/testing";

let harness: PgliteHarness;
let telemetry: TestTelemetry;

beforeEach(async () => {
  harness = await createMigratedPglite();
  telemetry = createTestTelemetry("p1-test");
});

afterEach(async () => {
  await telemetry.telemetry.shutdown();
  await harness.close();
});

describe("P1 exit demo — command → database → queue", () => {
  it("shares one trace id across the handler, the settings repository and the enqueue", async () => {
    const repository = new DrizzleSettingsRepository(harness.db, telemetry.telemetry);
    const receipts = new PostgresIdempotencyStore(harness.db);

    const queue = new InProcessJobQueue({
      idempotency: receipts,
      telemetry: telemetry.telemetry,
      retryPolicy: { maxAttempts: 3, backoffMs: 1 },
    });

    let effects = 0;
    queue.register("demo.job", async () => {
      effects += 1;
    });

    const demo = defineCommand({
      name: "trace-demo",
      description: "Writes settings then enqueues a job",
      async execute(ctx) {
        const guildId = ctx.guildId;
        if (!guildId) throw new Error("guild required");
        await ctx.settings.get(guildId);
        await ctx.settings.update(guildId, { enabled: true });
        await ctx.queue.enqueue("demo.job", { guildId }, { idempotencyKey: "trace-job-1" });
      },
    });

    const registry = new ModuleRegistry().register(
      defineModule({
        id: "trace",
        name: "Trace",
        description: "P1 trace demo",
        version: "0.0.1",
        settingsSchema: z.object({ enabled: z.boolean().default(true) }),
        defaultSettings: { enabled: true },
        commands: [demo],
      }),
    );

    const interaction = new FakeInteraction({ commandName: "trace-demo", guildId: "guild-1" });
    const outcome = await dispatchCommand(
      {
        registry,
        settings: new SettingsService(repository, registry),
        logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } },
        cooldowns: new InMemoryCooldownStore(),
        queue,
        health: staticHealth({
          database: { configured: true, reachable: true, migrated: true },
        }),
        telemetry: telemetry.telemetry,
      },
      interaction,
    );
    await queue.drain();

    expect(outcome.status).toBe("ok");
    expect(effects).toBe(1);
    expect(await repository.get("guild-1", "trace")).toEqual({ enabled: true });

    const spans = telemetry.spans();
    const command = spans.find((span) => span.name === "command trace-demo");
    const read = spans.find((span) => span.name === "db.settings.get");
    const write = spans.find((span) => span.name === "db.settings.set");
    const enqueue = spans.find((span) => span.name === "queue.enqueue");
    const job = spans.find((span) => span.name === "job demo.job");

    expect(command).toBeDefined();
    expect(read).toBeDefined();
    expect(write).toBeDefined();
    expect(enqueue).toBeDefined();
    expect(job).toBeDefined();

    const traceIds = new Set([command!, read!, write!, enqueue!, job!].map((span) => span.traceId));
    expect(traceIds.size).toBe(1);
    expect(read?.parentSpanId).toBe(command?.spanId);
    expect(write?.parentSpanId).toBe(command?.spanId);
    expect(enqueue?.parentSpanId).toBe(command?.spanId);
    expect(job?.parentSpanId).toBe(enqueue?.spanId);
  });
});
