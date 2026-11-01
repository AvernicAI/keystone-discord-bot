import { describe, expect, it } from "vitest";
import { createTestSettings } from "@keystone/testing";
import type { AiCompletion, AiCompletionRequest } from "@keystone/kernel";
import { AiService, chunkText, cosineSimilarity } from "./service";
import { InMemoryAiStore } from "./store";
import { DeterministicAiProvider } from "./provider";
import { aiDefaultSettings } from "./settings";

class CountingProvider extends DeterministicAiProvider {
  calls = 0;

  override async complete(input: AiCompletionRequest): Promise<AiCompletion> {
    this.calls += 1;
    return super.complete(input);
  }
}

function service(overrides: Record<string, unknown> = {}, provider = new CountingProvider()) {
  const settings = createTestSettings({ ...aiDefaultSettings, ...overrides });
  const store = new InMemoryAiStore();
  return {
    ai: new AiService(store, provider, settings, () => 1_700_000_000_000),
    store,
    settings,
    provider,
  };
}

describe("AiService", () => {
  it("indexes admin docs, retrieves a source and records only usage counters", async () => {
    const { ai, store } = service({ enabled: true });
    const document = await ai.addDocument(
      "guild-a",
      "Refund policy",
      "Refunds are available within 14 days of purchase. Open a ticket with your receipt.",
    );
    expect(document.chunks).toBeGreaterThan(0);

    const answer = await ai.ask("guild-a", "How do refunds work?");
    expect(answer.sources).toEqual(["Refund policy"]);
    expect(answer.text).toContain("Refund");
    expect(answer.usage.inputTokens).toBeGreaterThan(0);

    const usage = await store.getUsage("guild-a", "2023-11");
    expect(usage).toMatchObject({ requests: 1, outputTokens: answer.usage.outputTokens });
    expect(Object.keys(usage ?? {}).sort()).toEqual([
      "costUsd",
      "guildId",
      "inputTokens",
      "outputTokens",
      "period",
      "requests",
    ]);
    expect(JSON.stringify(usage)).not.toContain("How do refunds work?");
  });

  it("refuses every call past the monthly dollar cap before reaching the provider", async () => {
    const provider = new CountingProvider({ costPerCall: 0.01 });
    const { ai } = service({ enabled: true, monthlyBudgetUsd: 0.01 }, provider);
    await ai.addDocument("guild-a", "Rules", "Be kind and follow the server rules.");

    const first = await ai.ask("guild-a", "rules");
    expect(first.usage.costUsd).toBe(0.01);
    await expect(ai.ask("guild-a", "rules")).rejects.toThrow(/monthly AI budget/i);
    expect(provider.calls).toBe(1);
  });

  it("refuses calls past the request cap and reports disabled status without a provider call", async () => {
    const provider = new CountingProvider();
    const capped = service({ enabled: true, monthlyRequests: 1 }, provider);
    await capped.ai.addDocument("guild-a", "Rules", "Be kind and follow the server rules.");
    await capped.ai.ask("guild-a", "rules");
    await expect(capped.ai.ask("guild-a", "rules")).rejects.toThrow(/1 AI requests/i);
    expect(provider.calls).toBe(1);

    const off = service();
    const status = await off.ai.status("guild-a");
    expect(status.enabled).toBe(false);
    await expect(off.ai.ask("guild-a", "rules")).rejects.toThrow(/disabled/i);
    expect(off.provider.calls).toBe(0);
  });

  it("keeps ticket deflection retrieval-only when no document matches", async () => {
    const { ai, provider } = service({ enabled: true, deflection: true });
    const answer = await ai.deflect("guild-a", "I need a refund");
    expect(answer.model).toBe("retrieval-only");
    expect(answer.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(answer.text).toContain("human");
    expect(provider.calls).toBe(0);
  });

  it("answers chat and explains moderation facts without taking an action", async () => {
    const { ai } = service({
      enabled: true,
      chat: true,
      classification: true,
      explanations: true,
      summaries: true,
    });
    const chat = await ai.chat("guild-a", "user-1", "hello");
    expect(chat.text.length).toBeGreaterThan(0);

    const classification = await ai.classify("guild-a", "buy cheap followers now");
    expect(classification.text).toContain("buy cheap followers now");
    expect(classification.sources).toEqual([]);

    const explanation = await ai.explain(
      "guild-a",
      "Case #7\nAction: timeout\nRule: duplicate\nState: open\nReason: repeated spam",
    );
    expect(explanation.text).toContain("Case #7");
    expect(explanation.sources).toEqual([]);

    const summary = await ai.summarize("guild-a", "user: I cannot log in\nsupport: reset link sent");
    expect(summary.text.length).toBeGreaterThan(0);

    const chatOff = service({ enabled: true, chat: false });
    await expect(chatOff.ai.chat("guild-a", "user-1", "hello")).rejects.toThrow(/chat is not enabled/i);
  });

  it("scopes documents by guild and removes only the requested document", async () => {
    const { ai } = service({ enabled: true });
    const one = await ai.addDocument("guild-a", "One", "Only guild A knows this.");
    await ai.addDocument("guild-b", "Two", "Only guild B knows this.");
    expect((await ai.listDocuments("guild-a")).map((doc) => doc.name)).toEqual(["One"]);
    expect(await ai.removeDocument("guild-b", one.id)).toBe(false);
    expect(await ai.removeDocument("guild-a", one.id)).toBe(true);
    expect(await ai.listDocuments("guild-a")).toEqual([]);
  });

  it("rejects oversized documents and keeps chunk/cosine behaviour deterministic", async () => {
    const { ai } = service({ enabled: true, maxDocumentChars: 500 });
    await expect(ai.addDocument("guild-a", "Too big", "x".repeat(501))).rejects.toThrow(
      /500 characters/,
    );
    expect(chunkText("one\n\ntwo", 5)).toEqual(["one", "two"]);
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});
