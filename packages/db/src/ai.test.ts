import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleAiStore } from "./ai-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("DrizzleAiStore", () => {
  it("persists scoped documents and aggregate usage without prompt columns", async () => {
    harness = await createMigratedPglite();
    const store = new DrizzleAiStore(harness.db as never);

    const document = await store.addDocument({
      guildId: "guild-a",
      name: "Rules",
      content: "Be kind.",
      chunks: [{ text: "Be kind.", embedding: [1, 0] }],
    });
    expect(await store.listDocuments("guild-a")).toHaveLength(1);
    expect(await store.listDocuments("guild-b")).toHaveLength(0);
    expect(await store.removeDocument("guild-b", document.id)).toBe(false);
    expect(await store.removeDocument("guild-a", document.id)).toBe(true);
    expect(await store.listDocuments("guild-a")).toHaveLength(0);
  });

  it("increments monthly requests, tokens and micro-dollar cost atomically", async () => {
    harness = await createMigratedPglite();
    const store = new DrizzleAiStore(harness.db as never);

    await store.addUsage({
      guildId: "guild-a",
      period: "2026-11",
      requests: 1,
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.01,
    });
    const usage = await store.addUsage({
      guildId: "guild-a",
      period: "2026-11",
      requests: 1,
      inputTokens: 5,
      outputTokens: 7,
      costUsd: 0.02,
    });
    expect(usage).toMatchObject({
      guildId: "guild-a",
      period: "2026-11",
      requests: 2,
      inputTokens: 15,
      outputTokens: 27,
    });
    expect(usage.costUsd).toBeCloseTo(0.03, 6);
    expect(await store.getUsage("guild-b", "2026-11")).toBeUndefined();
  });
});
