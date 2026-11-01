import { UserError } from "@keystone/kernel";
import type {
  AiAnswer,
  AiDocument,
  AiDocumentSummary,
  AiPort,
  AiProvider,
  AiStatus,
  AiStore,
  AiUsage,
  ModuleSettings,
} from "@keystone/kernel";
import { aiSettingsSchema, type AiSettings } from "./settings";

const ZERO_USAGE = (guildId: string, period: string): AiUsage => ({
  guildId,
  period,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
});

export function periodFor(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** Split at paragraph boundaries where possible, never at a UTF-16 surrogate. */
export function chunkText(text: string, chunkChars = 1_200): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > 0) {
    if (remaining.length <= chunkChars) {
      chunks.push(remaining.trim());
      break;
    }
    const window = remaining.slice(0, chunkChars);
    const split = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    const cut = split > chunkChars * 0.4 ? split : chunkChars;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  return chunks.filter(Boolean);
}

/** Exact cosine similarity for the portable vector index. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    const leftValue = a[index] ?? 0;
    const rightValue = b[index] ?? 0;
    dot += leftValue * rightValue;
    left += leftValue * leftValue;
    right += rightValue * rightValue;
  }
  if (left === 0 || right === 0) return 0;
  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

interface RetrievedChunk {
  readonly source: string;
  readonly text: string;
  readonly score: number;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * The AI capability. Every public method reads the guild's policy from the
 * settings port and checks the hard cap before it reaches a provider. The store
 * only sees numbers, document text and explicit admin docs — never a prompt or
 * a completion.
 */
export class AiService implements AiPort {
  readonly providerName: string;
  readonly configured: boolean;

  constructor(
    private readonly store: AiStore,
    private readonly provider: AiProvider,
    private readonly settings: ModuleSettings,
    private readonly now: () => number = Date.now,
  ) {
    this.providerName = provider.name;
    this.configured = provider.configured;
  }

  async ask(guildId: string, question: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "ask");
    const usage = await this.assertBudget(guildId, policy);
    const retrieved = await this.retrieve(guildId, question, policy);
    if (retrieved.length === 0) {
      throw new UserError("No server document matched that question. Add docs with `/ai docs-add` first.");
    }
    const context = this.renderContext(retrieved);
    return this.complete(
      guildId,
      policy,
      "You are Keystone's server assistant. Answer only from the provided server documentation. If the docs do not contain the answer, say so and recommend a human. Never invent policy, never punish anyone, and never claim an action was taken.",
      `Question: ${truncate(question, 1_500)}\n\n${context}`,
      [...new Set(retrieved.map((row) => row.source))],
    );
  }

  async chat(guildId: string, userId: string, message: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "chat");
    await this.assertBudget(guildId, policy);
    const retrieved = await this.retrieve(guildId, message, policy);
    const context = retrieved.length > 0 ? this.renderContext(retrieved) : "No server docs were retrieved.";
    return this.complete(
      guildId,
      policy,
      "You are Keystone's opt-in persona chat. Be concise and friendly. You may recommend server docs, but you may not moderate, punish, or claim to have taken an action. Never ask for secrets.",
      `Member <@${userId}> said: ${truncate(message, 1_500)}\n\n${context}`,
      [...new Set(retrieved.map((row) => row.source))],
    );
  }

  async classify(guildId: string, text: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "classification");
    await this.assertBudget(guildId, policy);
    return this.complete(
      guildId,
      policy,
      "Classify the supplied server message for a human moderator. Return one short label, a confidence from 0 to 1, and the evidence words. This is advisory only: never claim an action was taken and never recommend an automatic punishment.",
      `Message:\n${truncate(text, 2_000)}`,
      [],
    );
  }

  async deflect(guildId: string, question: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "deflection");
    await this.assertBudget(guildId, policy);
    const retrieved = await this.retrieve(guildId, question, policy);
    if (retrieved.length === 0) {
      return {
        text: "I could not find a matching server document. A human support member should take this ticket.",
        sources: [],
        model: "retrieval-only",
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
    }
    const context = this.renderContext(retrieved);
    return this.complete(
      guildId,
      policy,
      "You are a ticket-deflection assistant. Answer only from the provided server documentation. If the docs do not answer it, say a human should take over. Never promise a refund, punishment or policy exception.",
      `Support question: ${truncate(question, 1_500)}\n\n${context}`,
      [...new Set(retrieved.map((row) => row.source))],
    );
  }

  async explain(guildId: string, facts: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "explanations");
    await this.assertBudget(guildId, policy);
    return this.complete(
      guildId,
      policy,
      "Explain why a moderation rule may have fired, in plain language. Use only the supplied case facts. Distinguish fact from recommendation. Never claim a punishment was applied and never recommend an irreversible action without human review.",
      `Case facts:\n${truncate(facts, 3_000)}`,
      [],
    );
  }

  async summarize(guildId: string, transcript: string): Promise<AiAnswer> {
    const policy = await this.policy(guildId);
    this.assertReady(policy, "summaries");
    await this.assertBudget(guildId, policy);
    return this.complete(
      guildId,
      policy,
      "Summarize the support transcript in at most five short bullets. Include the unresolved question, decisions already made, and the next human action. Do not invent a resolution.",
      `Transcript:\n${truncate(transcript, 6_000)}`,
      [],
    );
  }

  async addDocument(guildId: string, name: string, content: string): Promise<AiDocumentSummary> {
    const policy = await this.policy(guildId);
    this.assertProvider();
    await this.assertBudget(guildId, policy);
    const cleanName = name.trim();
    const cleanContent = content.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new UserError("Document names must be 1–80 characters.");
    }
    if (!cleanContent || cleanContent.length > policy.maxDocumentChars) {
      throw new UserError(`Document content must be 1–${policy.maxDocumentChars} characters.`);
    }
    const chunks = chunkText(cleanContent, policy.chunkChars);
    if (chunks.length === 0) throw new UserError("That document has no readable content.");
    const embeddings = await this.provider.embed(chunks);
    const document = await this.store.addDocument({
      guildId,
      name: cleanName,
      content: cleanContent,
      chunks: chunks.map((text, index) => ({ text, embedding: embeddings[index] ?? [] })),
    });
    return this.summaryOf(document);
  }

  async listDocuments(guildId: string): Promise<AiDocumentSummary[]> {
    return (await this.store.listDocuments(guildId, 100)).map((document) => this.summaryOf(document));
  }

  async removeDocument(guildId: string, documentId: string): Promise<boolean> {
    return this.store.removeDocument(guildId, documentId);
  }

  async status(guildId: string): Promise<AiStatus> {
    const policy = await this.policy(guildId);
    const usage = (await this.usage(guildId)) ?? ZERO_USAGE(guildId, periodFor(this.now()));
    return {
      enabled: policy.enabled,
      provider: this.provider.name,
      configured: this.provider.configured,
      features: {
        chat: policy.chat,
        classification: policy.classification,
        deflection: policy.deflection,
        explanations: policy.explanations,
        summaries: policy.summaries,
      },
      usage,
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
      monthlyRequests: policy.monthlyRequests,
      documents: (await this.store.listDocuments(guildId, 100)).length,
    };
  }

  private async policy(guildId: string): Promise<AiSettings> {
    return aiSettingsSchema.parse(await this.settings.get(guildId));
  }

  private async usage(guildId: string): Promise<AiUsage | undefined> {
    return this.store.getUsage(guildId, periodFor(this.now()));
  }

  private assertProvider(): void {
    if (!this.provider.configured) {
      throw new UserError("AI is not configured. An operator must set AI_API_KEY and AI_BASE_URL.");
    }
  }

  private assertReady(
    policy: AiSettings,
    feature: "ask" | "chat" | "classification" | "deflection" | "explanations" | "summaries",
  ): void {
    if (!policy.enabled) throw new UserError("AI is disabled in this server.");
    if (feature !== "ask" && !policy[feature]) {
      throw new UserError(`AI ${feature} is not enabled in this server.`);
    }
    this.assertProvider();
  }

  private async assertBudget(guildId: string, policy: AiSettings): Promise<AiUsage> {
    const usage = (await this.usage(guildId)) ?? ZERO_USAGE(guildId, periodFor(this.now()));
    if (usage.requests >= policy.monthlyRequests) {
      throw new UserError(
        `This server has used its ${policy.monthlyRequests} AI requests for this month.`,
      );
    }
    if (usage.costUsd >= policy.monthlyBudgetUsd) {
      throw new UserError(
        `This server has reached its $${policy.monthlyBudgetUsd.toFixed(2)} monthly AI budget.`,
      );
    }
    return usage;
  }

  private async retrieve(guildId: string, query: string, policy: AiSettings): Promise<RetrievedChunk[]> {
    if (!query.trim()) return [];
    const documents = await this.store.listDocuments(guildId, 100);
    if (documents.length === 0) return [];
    const [embedding] = await this.provider.embed([query]);
    if (!embedding) return [];
    const scored: RetrievedChunk[] = [];
    for (const document of documents) {
      for (const chunk of document.chunks) {
        const score = cosineSimilarity(embedding, chunk.embedding);
        if (score > 0) scored.push({ source: document.name, text: chunk.text, score });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, policy.contextChunks);
  }

  private renderContext(rows: readonly RetrievedChunk[]): string {
    return rows.map((row) => `[source:${row.source}]\n${truncate(row.text, 1_500)}`).join("\n\n");
  }

  private async complete(
    guildId: string,
    policy: AiSettings,
    system: string,
    user: string,
    sources: readonly string[],
  ): Promise<AiAnswer> {
    const result = await this.provider.complete({
      system,
      user,
      maxTokens: policy.maxOutputTokens,
    });
    const costUsd = Number.isFinite(result.costUsd) ? Math.max(0, result.costUsd) : 0;
    await this.store.addUsage({
      guildId,
      period: periodFor(this.now()),
      requests: 1,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
    });
    return {
      text: result.text,
      sources,
      model: result.model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
      },
    };
  }

  private summaryOf(document: AiDocument): AiDocumentSummary {
    return {
      id: document.id,
      name: document.name,
      chunks: document.chunks.length,
      createdAt: document.createdAt,
    };
  }
}
