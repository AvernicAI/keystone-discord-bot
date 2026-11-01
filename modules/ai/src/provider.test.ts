import { describe, expect, it } from "vitest";
import { createAiProvider, OpenAiCompatibleProvider } from "./provider";

describe("AI provider abstraction", () => {
  it("returns an explicitly unconfigured provider without a key", async () => {
    const provider = createAiProvider({});
    expect(provider.configured).toBe(false);
    expect(provider.name).toBe("unconfigured");
    await expect(provider.embed(["hello"])).rejects.toThrow(/not configured/i);
  });

  it("calls the OpenAI-compatible endpoints and computes rate-card cost", async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fetchImpl = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
        auth: new Headers(init?.headers).get("authorization"),
      });
      if (String(input).endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            model: "test-model",
            choices: [{ message: { content: "A grounded answer." } }],
            usage: { prompt_tokens: 1_000, completion_tokens: 500 },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const provider = new OpenAiCompatibleProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1/",
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
      fetchImpl,
    });

    const completion = await provider.complete({
      system: "Be useful.",
      user: "Question",
      maxTokens: 100,
    });
    expect(completion).toMatchObject({
      text: "A grounded answer.",
      model: "test-model",
      inputTokens: 1_000,
      outputTokens: 500,
    });
    expect(completion.costUsd).toBeCloseTo(0.002, 8);
    expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions");
    expect(calls[0]?.auth).toBe("Bearer test-key");
    expect(calls[0]?.body).toMatchObject({ model: "gpt-4o-mini", max_tokens: 100 });

    const embeddings = await provider.embed(["a", "b"]);
    expect(embeddings).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(calls[1]?.url).toBe("https://example.test/v1/embeddings");
  });

  it("sends Ollama's think:false only when the operator opts in", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: {} }),
        { status: 200 },
      );
    }) as typeof fetch;

    const quiet = new OpenAiCompatibleProvider({
      apiKey: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      disableThinking: true,
      fetchImpl,
    });
    await quiet.complete({ system: "s", user: "u", maxTokens: 10 });
    expect(bodies[0]).toMatchObject({ think: false });

    const standard = new OpenAiCompatibleProvider({ apiKey: "key", fetchImpl });
    await standard.complete({ system: "s", user: "u", maxTokens: 10 });
    expect(bodies[1]).not.toHaveProperty("think");
  });

  it("surfaces a provider HTTP failure instead of inventing an answer", async () => {
    const provider = new OpenAiCompatibleProvider({
      apiKey: "test-key",
      fetchImpl: (async () => new Response("nope", { status: 429 })) as typeof fetch,
    });
    await expect(
      provider.complete({ system: "s", user: "u", maxTokens: 10 }),
    ).rejects.toThrow("HTTP 429");
  });
});
