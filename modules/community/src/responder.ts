import { randomUUID } from "node:crypto";
import { UserError } from "@keystone/kernel";
import type { CommunityActions, CommunityStore } from "@keystone/kernel";
import type { CommunitySettings } from "./settings";

export type ResponderMatch = "exact" | "contains" | "regex";

export interface ResponderRecord {
  readonly id: string;
  readonly trigger: string;
  readonly match: ResponderMatch;
  readonly response: string;
  readonly cooldownSeconds: number;
  readonly createdBy: string;
  readonly lastAt?: string;
}

export interface ResponderHit {
  readonly id: string;
  readonly response: string;
}

const MAX_TRIGGER = 100;
const MAX_RESPONSE = 1_500;
const MAX_COOLDOWN_SECONDS = 3_600;
const RANK: Record<ResponderMatch, number> = { exact: 0, contains: 1, regex: 2 };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Auto-responder triggers. The operator owns the trigger and the reply; the
 * service only matches a message, enforces the per-trigger cooldown and sends
 * one response. Records live behind the community record seam, so the same
 * code runs on the in-memory store and on Postgres.
 */
export class AutoResponderService {
  constructor(
    private readonly store: CommunityStore,
    private readonly actions: CommunityActions,
    private readonly settings: CommunitySettings,
    private readonly now: () => number = Date.now,
  ) {}

  async save(
    guildId: string,
    input: {
      readonly trigger: string;
      readonly match: ResponderMatch;
      readonly response: string;
      readonly createdBy: string;
      readonly cooldownSeconds?: number;
    },
  ): Promise<ResponderRecord> {
    const trigger = input.trigger.trim();
    if (!trigger) throw new UserError("An auto-responder needs a trigger.");
    if (trigger.length > MAX_TRIGGER) {
      throw new UserError(`A trigger is limited to ${MAX_TRIGGER} characters.`);
    }
    if (!["exact", "contains", "regex"].includes(input.match)) {
      throw new UserError("Match must be exact, contains or regex.");
    }
    if (input.match === "regex") {
      try {
        new RegExp(trigger, "iu");
      } catch {
        throw new UserError("That regular expression is not valid.");
      }
    }
    const response = input.response.trim();
    if (!response) throw new UserError("An auto-responder needs a response.");

    const cooldownSeconds = input.cooldownSeconds ?? this.settings.responders.cooldownSeconds;
    if (
      !Number.isInteger(cooldownSeconds) ||
      cooldownSeconds < 0 ||
      cooldownSeconds > MAX_COOLDOWN_SECONDS
    ) {
      throw new UserError(`The cooldown must be 0–${MAX_COOLDOWN_SECONDS} seconds.`);
    }

    const records = await this.store.listRecords<ResponderRecord>(guildId, "responder", 100);
    if (
      records.some(
        (record) =>
          record.data.match === input.match &&
          normalize(record.data.trigger) === normalize(trigger),
      )
    ) {
      throw new UserError("That trigger already exists with the same match mode.");
    }
    if (records.length >= this.settings.responders.max) {
      throw new UserError(
        `This server has reached ${this.settings.responders.max} auto-responders.`,
      );
    }

    const record: ResponderRecord = {
      id: randomUUID(),
      trigger,
      match: input.match,
      response: response.slice(0, MAX_RESPONSE),
      cooldownSeconds,
      createdBy: input.createdBy,
    };
    await this.store.putRecord(guildId, "responder", record.id, record);
    return record;
  }

  async list(guildId: string): Promise<ResponderRecord[]> {
    const records = await this.store.listRecords<ResponderRecord>(guildId, "responder", 100);
    return records.map((record) => record.data);
  }

  async remove(guildId: string, id: string): Promise<boolean> {
    const existing = await this.store.getRecord(guildId, "responder", id);
    if (!existing) return false;
    await this.store.deleteRecord(guildId, "responder", id);
    return true;
  }

  /**
   * Match one message against the guild's triggers. Exact beats contains, and
   * contains beats regex, so the result does not depend on storage order. A
   * cooling trigger is skipped, and at most one reply is sent per message.
   */
  async respond(
    guildId: string,
    channelId: string,
    content: string,
  ): Promise<ResponderHit | undefined> {
    if (!this.settings.responders.enabled) return undefined;
    const text = content.trim();
    if (!text) return undefined;

    const records = await this.store.listRecords<ResponderRecord>(guildId, "responder", 100);
    const candidates = [...records].sort(
      (a, b) =>
        RANK[a.data.match] - RANK[b.data.match] ||
        a.data.trigger.localeCompare(b.data.trigger),
    );

    for (const record of candidates) {
      if (!matches(record.data, text)) continue;
      const lastAt = record.data.lastAt ? Date.parse(record.data.lastAt) : 0;
      if (this.now() - lastAt < record.data.cooldownSeconds * 1_000) continue;

      const result = await this.actions.sendMessage(guildId, channelId, {
        content: record.data.response,
        allowedMentions: { parse: [] },
      });
      if (!result.ok) return undefined;
      await this.store.putRecord(guildId, "responder", record.key, {
        ...record.data,
        lastAt: new Date(this.now()).toISOString(),
      });
      return { id: record.key, response: record.data.response };
    }
    return undefined;
  }
}

function matches(record: ResponderRecord, content: string): boolean {
  if (record.match === "exact") return normalize(content) === normalize(record.trigger);
  if (record.match === "contains") {
    return normalize(content).includes(normalize(record.trigger));
  }
  return new RegExp(record.trigger, "iu").test(content);
}
