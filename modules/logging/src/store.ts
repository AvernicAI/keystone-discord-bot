import { randomUUID } from "node:crypto";
import type {
  LogEventInput,
  LogEventRecord,
  LoggingStore,
} from "@keystone/kernel";

/** Real in-memory implementation of the same port as the Postgres store. */
export class InMemoryLoggingStore implements LoggingStore {
  readonly #events: LogEventRecord[] = [];

  async append(input: LogEventInput): Promise<LogEventRecord> {
    const record: LogEventRecord = {
      id: randomUUID(),
      guildId: input.guildId,
      kind: input.kind,
      actorId: input.actorId,
      targetId: input.targetId,
      channelId: input.channelId,
      messageId: input.messageId,
      summary: input.summary,
      data: input.data ? { ...input.data } : undefined,
      createdAt: new Date(input.at).toISOString(),
    };
    this.#events.push(record);
    return record;
  }

  async list(guildId: string, limit: number): Promise<LogEventRecord[]> {
    return this.#events
      .filter((record) => record.guildId === guildId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async count(guildId: string): Promise<number> {
    return this.#events.filter((record) => record.guildId === guildId).length;
  }

  /** Read-only helper for the in-memory analytics adapter; not part of the port. */
  records(guildId: string): readonly LogEventRecord[] {
    return this.#events.filter((record) => record.guildId === guildId).map((record) => ({ ...record }));
  }

  async prune(guildId: string, before: string): Promise<number> {
    const beforeCount = this.#events.length;
    for (let index = this.#events.length - 1; index >= 0; index -= 1) {
      const record = this.#events[index];
      if (record && record.guildId === guildId && record.createdAt < before) {
        this.#events.splice(index, 1);
      }
    }
    return beforeCount - this.#events.length;
  }
}
