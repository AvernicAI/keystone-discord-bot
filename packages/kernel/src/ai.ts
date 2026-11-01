/**
 * Structural AI types. No provider SDK, no network, no message retention.
 *
 * The module owns policy and retrieval; the composition root chooses whether a
 * provider is configured. The store deliberately has no prompt/completion
 * fields: retention is a schema decision, not a setting someone can forget.
 */

export interface AiCompletionRequest {
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
}

export interface AiCompletion {
  readonly text: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Provider-reported or rate-card cost for this call. */
  readonly costUsd: number;
}

export interface AiProvider {
  readonly name: string;
  readonly configured: boolean;
  complete(input: AiCompletionRequest): Promise<AiCompletion>;
  embed(inputs: readonly string[]): Promise<number[][]>;
}

export interface AiChunk {
  readonly text: string;
  readonly embedding: readonly number[];
}

export interface AiDocument {
  readonly id: string;
  readonly guildId: string;
  readonly name: string;
  readonly content: string;
  readonly chunks: readonly AiChunk[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewAiDocument {
  readonly guildId: string;
  readonly name: string;
  readonly content: string;
  readonly chunks: readonly AiChunk[];
}

/** Safe projection used by commands; never includes document bodies. */
export interface AiDocumentSummary {
  readonly id: string;
  readonly name: string;
  readonly chunks: number;
  readonly createdAt: string;
}

export interface AiUsage {
  readonly guildId: string;
  /** UTC calendar month, `YYYY-MM`. */
  readonly period: string;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface AiUsageIncrement {
  readonly guildId: string;
  readonly period: string;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

/** Persistence owned by the AI module; no module sees these tables. */
export interface AiStore {
  addDocument(input: NewAiDocument): Promise<AiDocument>;
  listDocuments(guildId: string, limit?: number): Promise<AiDocument[]>;
  removeDocument(guildId: string, documentId: string): Promise<boolean>;
  getUsage(guildId: string, period: string): Promise<AiUsage | undefined>;
  addUsage(input: AiUsageIncrement): Promise<AiUsage>;
}

export interface AiAnswerUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface AiAnswer {
  readonly text: string;
  readonly sources: readonly string[];
  readonly model: string;
  readonly usage: AiAnswerUsage;
}

export interface AiStatus {
  readonly enabled: boolean;
  readonly provider: string;
  readonly configured: boolean;
  readonly features: {
    readonly chat: boolean;
    readonly classification: boolean;
    readonly deflection: boolean;
    readonly explanations: boolean;
    readonly summaries: boolean;
  };
  readonly usage: AiUsage;
  readonly monthlyBudgetUsd: number;
  readonly monthlyRequests: number;
  readonly documents: number;
}

/**
 * The capability commands and events use. Methods read the guild's AI policy
 * themselves so every caller goes through the same server-side cap check.
 */
export interface AiPort {
  readonly providerName: string;
  readonly configured: boolean;
  ask(guildId: string, question: string): Promise<AiAnswer>;
  chat(guildId: string, userId: string, message: string): Promise<AiAnswer>;
  classify(guildId: string, text: string): Promise<AiAnswer>;
  deflect(guildId: string, question: string): Promise<AiAnswer>;
  explain(guildId: string, facts: string): Promise<AiAnswer>;
  summarize(guildId: string, transcript: string): Promise<AiAnswer>;
  addDocument(guildId: string, name: string, content: string): Promise<AiDocumentSummary>;
  listDocuments(guildId: string): Promise<AiDocumentSummary[]>;
  removeDocument(guildId: string, documentId: string): Promise<boolean>;
  status(guildId: string): Promise<AiStatus>;
}
