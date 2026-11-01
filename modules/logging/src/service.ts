import type {
  LogEventInput,
  LogEventRecord,
  LoggingActions,
  LoggingActionResult,
  LoggingStore,
  ModerationCase,
  ModuleSettings,
} from "@keystone/kernel";
import { logEmbed } from "./format";
import { eventEnabled, loggingSettingsSchema, type LoggingSettings } from "./settings";

export type LoggingSkipReason = "disabled" | "event-off" | "no-channel" | "delivery-failed";

export interface LoggingResult {
  readonly stored: boolean;
  readonly delivered: boolean;
  readonly reason?: LoggingSkipReason;
}

export interface LoggingStatus {
  readonly settings: LoggingSettings;
  readonly stored: number;
}

export interface LoggingExport {
  readonly version: 1;
  readonly guildId: string;
  readonly exportedAt: string;
  readonly settings: LoggingSettings;
  readonly events: readonly LogEventRecord[];
}

/**
 * Logging policy in one place.
 *
 * The event is appended before the Discord call. That ordering is the audit
 * guarantee: a deleted or unreadable log channel loses delivery, not history.
 * A disabled module or a disabled event writes nothing at all.
 */
export class LoggingService {
  constructor(
    private readonly store: LoggingStore,
    private readonly actions: LoggingActions,
    private readonly settings: ModuleSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async record(input: LogEventInput): Promise<LoggingResult> {
    const current = await this.#settings(input.guildId);
    if (!current.enabled) return { stored: false, delivered: false, reason: "disabled" };
    if (!eventEnabled(current, input.kind)) {
      return { stored: false, delivered: false, reason: "event-off" };
    }

    const record = await this.store.append(input);
    if (!current.channelId) {
      return { stored: true, delivered: false, reason: "no-channel" };
    }

    try {
      const result = await this.actions.send(input.guildId, current.channelId, {
        embeds: [logEmbed(record)],
      });
      return result.ok
        ? { stored: true, delivered: true }
        : { stored: true, delivered: false, reason: "delivery-failed" };
    } catch {
      // The event is durable. A broken adapter must not turn an audit record
      // into a failed moderation action or a crashing gateway listener.
      return { stored: true, delivered: false, reason: "delivery-failed" };
    }
  }

  async recordCase(record: ModerationCase): Promise<LoggingResult> {
    return this.record({
      guildId: record.guildId,
      kind: "moderation_action",
      actorId: record.actorId,
      targetId: record.targetId,
      summary: record.reason,
      data: {
        caseId: record.id,
        caseNumber: record.caseNumber,
        action: record.action,
        state: record.state,
        rule: record.rule,
      },
      at: this.now(),
    });
  }

  async status(guildId: string): Promise<LoggingStatus> {
    const current = await this.#settings(guildId);
    return { settings: current, stored: await this.store.count(guildId) };
  }

  async snapshot(guildId: string, limit = 10): Promise<LoggingExport> {
    const current = await this.#settings(guildId);
    return {
      version: 1,
      guildId,
      exportedAt: new Date(this.now()).toISOString(),
      settings: current,
      events: await this.store.list(guildId, limit),
    };
  }

  async prune(guildId: string): Promise<number> {
    const current = await this.#settings(guildId);
    const cutoff = new Date(
      this.now() - current.retentionDays * 86_400_000,
    ).toISOString();
    return this.store.prune(guildId, cutoff);
  }

  async testChannel(guildId: string, channelId: string): Promise<LoggingActionResult> {
    const current = await this.#settings(guildId);
    return this.actions.send(guildId, channelId, {
      embeds: [
        {
          title: "Keystone logging configured",
          description:
            "This channel is now the audit log destination. Enabled events will appear here; deleted and edited message content is stored until the retention window ends.",
          color: 0x57f287,
          fields: [
            { name: "Events", value: "Use `/logging events` to choose them.", inline: false },
            { name: "Retention", value: `${current.retentionDays} days`, inline: true },
          ],
          footer: { text: "This test message is not stored in the event ledger." },
        },
      ],
    });
  }

  async #settings(guildId: string): Promise<LoggingSettings> {
    return loggingSettingsSchema.parse(await this.settings.get(guildId));
  }

}
