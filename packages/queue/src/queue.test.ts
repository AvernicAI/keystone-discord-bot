import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "@keystone/db/testing";
import { PostgresIdempotencyStore } from "@keystone/db";
import { createTestTelemetry, type TestTelemetry } from "@keystone/telemetry";
import {
  DEFAULT_RETRY_POLICY,
  InProcessJobQueue,
  connectionFromUrl,
  redactRedisUrl,
  retryOptions,
  type RetryPolicy,
} from "./index";

let harness: PgliteHarness;
let receipts: PostgresIdempotencyStore;
let telemetry: TestTelemetry;

/** Fast retries for tests, but the same object shape the BullMQ path uses. */
const FAST: RetryPolicy = { maxAttempts: 3, backoffMs: 1 };

beforeEach(async () => {
  harness = await createMigratedPglite();
  receipts = new PostgresIdempotencyStore(harness.db as never);
  telemetry = createTestTelemetry();
});

afterEach(async () => {
  await telemetry.telemetry.shutdown();
  await harness.close();
});

describe("InProcessJobQueue", () => {
  it("retries a transient failure and applies the side effect exactly once", async () => {
    const queue = new InProcessJobQueue({
      idempotency: receipts,
      telemetry: telemetry.telemetry,
      retryPolicy: FAST,
    });

    let attempts = 0;
    let effects = 0;
    queue.register("flaky", async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient network blip");
      effects += 1;
    });

    await queue.enqueue("flaky", { guildId: "g1" }, { idempotencyKey: "job-1" });
    await queue.drain();

    expect(attempts).toBe(2);
    expect(effects).toBe(1);
    const receipt = await receipts.receipt("job-1");
    expect(receipt?.status).toBe("completed");
    expect(receipt?.attempts).toBe(2);

    const jobSpans = telemetry.spans().filter((span) => span.name === "job flaky");
    expect(jobSpans).toHaveLength(2);
  });

  it("records a permanently failing job as failed at the retry limit", async () => {
    const queue = new InProcessJobQueue({
      idempotency: receipts,
      telemetry: telemetry.telemetry,
      retryPolicy: FAST,
    });

    let attempts = 0;
    queue.register("doomed", async () => {
      attempts += 1;
      throw new Error("permanent failure");
    });

    await queue.enqueue("doomed", {}, { idempotencyKey: "job-2" });
    await queue.drain();

    expect(attempts).toBe(FAST.maxAttempts);
    const receipt = await receipts.receipt("job-2");
    expect(receipt?.status).toBe("failed");
    expect(receipt?.attempts).toBe(FAST.maxAttempts);
    expect(receipt?.lastError).toContain("permanent failure");
  });

  it("skips a completed job when the same idempotency key is delivered again", async () => {
    const queue = new InProcessJobQueue({
      idempotency: receipts,
      telemetry: telemetry.telemetry,
      retryPolicy: FAST,
    });

    let effects = 0;
    queue.register("once", async () => {
      effects += 1;
    });

    await queue.enqueue("once", {}, { idempotencyKey: "job-3" });
    await queue.drain();
    await queue.enqueue("once", {}, { idempotencyKey: "job-3" });
    await queue.drain();

    expect(effects).toBe(1);
    expect((await receipts.receipt("job-3"))?.status).toBe("completed");
  });

  it("dispatches by job name and records an unknown job as failed", async () => {
    const queue = new InProcessJobQueue({
      idempotency: receipts,
      telemetry: telemetry.telemetry,
      retryPolicy: { maxAttempts: 1, backoffMs: 1 },
    });

    const calls: string[] = [];
    queue.register("alpha", async () => {
      calls.push("alpha");
    });
    queue.register("beta", async () => {
      calls.push("beta");
    });

    await queue.enqueue("beta", {}, { idempotencyKey: "name-1" });
    await queue.drain();
    expect(calls).toEqual(["beta"]);

    await queue.enqueue("missing", {}, { idempotencyKey: "name-2" });
    await queue.drain();
    const receipt = await receipts.receipt("name-2");
    expect(receipt?.status).toBe("failed");
    expect(receipt?.lastError).toContain('No handler registered for job "missing"');
  });
});

describe("shared retry policy", () => {
  it("gives the in-process driver and BullMQ the same numbers", () => {
    const policy: RetryPolicy = { maxAttempts: 4, backoffMs: 7 };
    const queue = new InProcessJobQueue({ idempotency: receipts, retryPolicy: policy });

    expect(queue.retryPolicy).toEqual(policy);
    expect(retryOptions(undefined, policy)).toMatchObject({
      attempts: 4,
      backoff: { type: "exponential", delay: 7 },
    });
    expect(DEFAULT_RETRY_POLICY).toEqual({ maxAttempts: 3, backoffMs: 250 });
  });
});

describe("BullMQ configuration", () => {
  it("parses a Redis URL into connection fields", () => {
    expect(connectionFromUrl("redis://user:secret@redis.internal:6380/2")).toMatchObject({
      host: "redis.internal",
      port: 6380,
      username: "user",
      password: "secret",
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it("uses the idempotency key as the BullMQ job id", () => {
    expect(retryOptions({ idempotencyKey: "abc" }, DEFAULT_RETRY_POLICY)).toMatchObject({
      jobId: "abc",
      attempts: 3,
      backoff: { type: "exponential", delay: 250 },
    });
  });

  it("redacts credentials when a Redis URL appears in a message", () => {
    const redacted = redactRedisUrl("redis://user:super-secret@redis.internal:6379/0");
    expect(redacted).not.toContain("super-secret");
    expect(redacted).toContain("redis.internal");
    expect(redactRedisUrl("not a url")).toBe("<invalid redis url>");
  });
});
