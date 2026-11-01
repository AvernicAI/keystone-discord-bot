import { randomUUID } from "node:crypto";
import type {
  AiDocument,
  AiStore,
  AiUsage,
  AiUsageIncrement,
  NewAiDocument,
} from "@keystone/kernel";

const nowIso = (): string => new Date().toISOString();

/**
 * In-memory AI store. It is deliberately not a mock: usage is aggregated by
 * guild and month, documents are guild-scoped, and removing one cannot remove
 * another guild's document. Production swaps the Postgres adapter behind the
 * same port.
 */
export class InMemoryAiStore implements AiStore {
  readonly #documents = new Map<string, AiDocument>();
  readonly #usage = new Map<string, AiUsage>();

  async addDocument(input: NewAiDocument): Promise<AiDocument> {
    const at = nowIso();
    const document: AiDocument = {
      id: randomUUID(),
      guildId: input.guildId,
      name: input.name,
      content: input.content,
      chunks: input.chunks,
      createdAt: at,
      updatedAt: at,
    };
    this.#documents.set(`${input.guildId}:${document.id}`, document);
    return document;
  }

  async listDocuments(guildId: string, limit = 50): Promise<AiDocument[]> {
    return [...this.#documents.values()]
      .filter((document) => document.guildId === guildId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async removeDocument(guildId: string, documentId: string): Promise<boolean> {
    return this.#documents.delete(`${guildId}:${documentId}`);
  }

  async getUsage(guildId: string, period: string): Promise<AiUsage | undefined> {
    return this.#usage.get(`${guildId}:${period}`);
  }

  async addUsage(input: AiUsageIncrement): Promise<AiUsage> {
    const key = `${input.guildId}:${input.period}`;
    const existing = this.#usage.get(key) ?? {
      guildId: input.guildId,
      period: input.period,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    const updated: AiUsage = {
      ...existing,
      requests: existing.requests + input.requests,
      inputTokens: existing.inputTokens + input.inputTokens,
      outputTokens: existing.outputTokens + input.outputTokens,
      costUsd: Math.round((existing.costUsd + input.costUsd) * 1_000_000) / 1_000_000,
    };
    this.#usage.set(key, updated);
    return updated;
  }
}
