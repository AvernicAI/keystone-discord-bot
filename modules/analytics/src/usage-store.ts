import { randomUUID } from "node:crypto";
import type {
  CommandUsageInput,
  CommandUsageRecord,
  CommandUsageStore,
} from "@keystone/kernel";

/** Real in-memory implementation of the same append-only command usage port. */
export class InMemoryCommandUsageStore implements CommandUsageStore {
  readonly #rows: CommandUsageRecord[] = [];

  async record(input: CommandUsageInput): Promise<void> {
    this.#rows.push({
      id: randomUUID(),
      ...input,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    });
  }

  /** Read-only helper for the memory analytics adapter. */
  records(guildId: string): CommandUsageRecord[] {
    return this.#rows.filter((row) => row.guildId === guildId).map((row) => ({ ...row }));
  }
}
