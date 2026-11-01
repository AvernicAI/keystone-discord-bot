import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  AiDocument,
  AiStore,
  AiUsage,
  AiUsageIncrement,
  NewAiDocument,
} from "@keystone/kernel";
import { aiDocuments, aiUsage } from "./schema";
import type { schema } from "./schema";

type DocumentRow = typeof aiDocuments.$inferSelect;
type UsageRow = typeof aiUsage.$inferSelect;

function toDocument(row: DocumentRow): AiDocument {
  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    content: row.content,
    chunks: (row.chunks ?? []) as AiDocument["chunks"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toUsage(row: UsageRow): AiUsage {
  return {
    guildId: row.guildId,
    period: row.period,
    requests: row.requests,
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    costUsd: Number(row.costMicros) / 1_000_000,
  };
}

/** Postgres adapter for the AI port. Modules never import this file. */
export class DrizzleAiStore implements AiStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async addDocument(input: NewAiDocument): Promise<AiDocument> {
    const [row] = await this.db
      .insert(aiDocuments)
      .values({
        guildId: input.guildId,
        name: input.name,
        content: input.content,
        chunks: input.chunks,
      })
      .returning();
    if (!row) throw new Error("Could not save AI document");
    return toDocument(row);
  }

  async listDocuments(guildId: string, limit = 50): Promise<AiDocument[]> {
    const rows = await this.db
      .select()
      .from(aiDocuments)
      .where(eq(aiDocuments.guildId, guildId))
      .orderBy(desc(aiDocuments.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toDocument);
  }

  async removeDocument(guildId: string, documentId: string): Promise<boolean> {
    const rows = await this.db
      .delete(aiDocuments)
      .where(and(eq(aiDocuments.guildId, guildId), eq(aiDocuments.id, documentId)))
      .returning({ id: aiDocuments.id });
    return rows.length > 0;
  }

  async getUsage(guildId: string, period: string): Promise<AiUsage | undefined> {
    const [row] = await this.db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.guildId, guildId), eq(aiUsage.period, period)))
      .limit(1);
    return row ? toUsage(row) : undefined;
  }

  async addUsage(input: AiUsageIncrement): Promise<AiUsage> {
    const costMicros = Math.round(input.costUsd * 1_000_000);
    const [row] = await this.db
      .insert(aiUsage)
      .values({
        guildId: input.guildId,
        period: input.period,
        requests: input.requests,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costMicros,
      })
      .onConflictDoUpdate({
        target: [aiUsage.guildId, aiUsage.period],
        set: {
          requests: sql`${aiUsage.requests} + ${input.requests}`,
          inputTokens: sql`${aiUsage.inputTokens} + ${input.inputTokens}`,
          outputTokens: sql`${aiUsage.outputTokens} + ${input.outputTokens}`,
          costMicros: sql`${aiUsage.costMicros} + ${costMicros}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Could not record AI usage");
    return toUsage(row);
  }
}
