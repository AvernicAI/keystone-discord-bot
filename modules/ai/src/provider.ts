import type { AiCompletion, AiCompletionRequest, AiProvider } from "@keystone/kernel";

const DIMENSIONS = 64;

/** Small, stable hashing embedding used by the offline provider and tests. */
export function embedLocally(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g) ?? [];
  for (const token of tokens) {
    const normalized = token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
    let hash = 2_166_136_261;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    const bucket = Math.abs(hash) % DIMENSIONS;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

export interface DeterministicAiOptions {
  /** Makes cap tests independent of a vendor's rate card. */
  costPerCall?: number;
}

/**
 * An extractive offline provider. It is not a substitute for a hosted model;
 * it exists so the whole pipeline can be exercised without a token, network or
 * secret in CI. The runtime never silently substitutes it for a configured
 * vendor.
 */
export class DeterministicAiProvider implements AiProvider {
  readonly name = "deterministic-local";
  readonly configured = true;
  readonly #costPerCall: number;

  constructor(options: DeterministicAiOptions = {}) {
    this.#costPerCall = options.costPerCall ?? 0.000_5;
  }

  async complete(input: AiCompletionRequest): Promise<AiCompletion> {
    const sourceLines = input.user
      .split("\n")
      .filter((line) => line.startsWith("[source:"))
      .map((line) => line.slice(1, -1));
    const body = input.user
      .replace(/\[source:[^\]]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 700);
    const prefix = sourceLines.length > 0 ? "Based on the server docs: " : "Here is a concise answer: ";
    const text = `${prefix}${body || "I do not have enough context to answer safely."}`;
    return {
      text,
      model: "deterministic-local",
      inputTokens: Math.ceil((input.system.length + input.user.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
      costUsd: this.#costPerCall,
    };
  }

  async embed(inputs: readonly string[]): Promise<number[][]> {
    return inputs.map(embedLocally);
  }
}

/** A configured-but-disabled provider keeps status truthful without a network. */
export class UnavailableAiProvider implements AiProvider {
  readonly name = "unconfigured";
  readonly configured = false;

  async complete(): Promise<AiCompletion> {
    throw new Error("AI provider is not configured. Set AI_API_KEY and AI_BASE_URL.");
  }

  async embed(): Promise<number[][]> {
    throw new Error("AI provider is not configured. Set AI_API_KEY and AI_BASE_URL.");
  }
}

export interface OpenAiProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly embeddingModel?: string;
  readonly inputUsdPerMillion?: number;
  readonly outputUsdPerMillion?: number;
  readonly fetchImpl?: typeof fetch;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface EmbeddingResponse {
  data?: { embedding?: number[]; index?: number }[];
  model?: string;
}

/**
 * Minimal OpenAI-compatible adapter. It is server-only, never imported by a
 * module, and never receives a key from a browser.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";
  readonly configured = true;
  readonly #options: Required<Omit<OpenAiProviderOptions, "fetchImpl">> & {
    fetchImpl: typeof fetch;
  };

  constructor(options: OpenAiProviderOptions) {
    this.#options = {
      apiKey: options.apiKey,
      baseUrl: (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      model: options.model ?? "gpt-4o-mini",
      embeddingModel: options.embeddingModel ?? "text-embedding-3-small",
      inputUsdPerMillion: options.inputUsdPerMillion ?? 0.15,
      outputUsdPerMillion: options.outputUsdPerMillion ?? 0.6,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async complete(input: AiCompletionRequest): Promise<AiCompletion> {
    const response = await this.#options.fetchImpl(`${this.#options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#options.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        max_tokens: input.maxTokens,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`AI provider returned HTTP ${response.status}`);
    }
    const data = (await response.json()) as ChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("AI provider returned an empty completion");
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    return {
      text,
      model: data.model ?? this.#options.model,
      inputTokens,
      outputTokens,
      costUsd:
        (inputTokens * this.#options.inputUsdPerMillion +
          outputTokens * this.#options.outputUsdPerMillion) /
        1_000_000,
    };
  }

  async embed(inputs: readonly string[]): Promise<number[][]> {
    const response = await this.#options.fetchImpl(`${this.#options.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: this.#options.embeddingModel, input: inputs }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`AI provider returned HTTP ${response.status}`);
    }
    const data = (await response.json()) as EmbeddingResponse;
    const vectors = (data.data ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row) => row.embedding ?? []);
    if (vectors.length !== inputs.length || vectors.some((vector) => vector.length === 0)) {
      throw new Error("AI provider returned an invalid embedding response");
    }
    return vectors;
  }
}

export interface AiProviderConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly embeddingModel?: string;
  readonly inputUsdPerMillion?: number;
  readonly outputUsdPerMillion?: number;
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  if (!config.apiKey) return new UnavailableAiProvider();
  return new OpenAiCompatibleProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    embeddingModel: config.embeddingModel,
    inputUsdPerMillion: config.inputUsdPerMillion,
    outputUsdPerMillion: config.outputUsdPerMillion,
  });
}
