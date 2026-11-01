import type { EmbedField, EmbedPayload, LogEventRecord } from "@keystone/kernel";
import { LOG_EVENTS, logEventMeta } from "./events";
import type { LoggingSettings } from "./settings";

function text(value: unknown, max = 1_024): string {
  if (value === null || value === undefined) return "—";
  const rendered = typeof value === "string" ? value : String(value);
  return rendered.length > max ? `${rendered.slice(0, max - 1)}…` : rendered;
}

function mention(userId: string | undefined): string {
  if (!userId) return "Unknown";
  // Security rules use the synthetic actor `keystone`, which is not a snowflake.
  return /^\d{17,20}$/.test(userId) ? `<@${userId}>` : userId;
}

function channel(channelId: string | undefined): string {
  return channelId ? `<#${channelId}>` : "Unknown channel";
}

function field(name: string, value: unknown, inline = false): EmbedField {
  return { name, value: text(value), inline };
}

/** One formatter for every log event, so delivery and export agree. */
export function logEmbed(record: LogEventRecord): EmbedPayload {
  const meta = logEventMeta(record.kind);
  const data = record.data ?? {};
  const base = {
    color: meta?.color ?? 0x5865f2,
    footer: { text: `Keystone logging · ${record.kind}` },
    timestamp: record.createdAt,
  };

  if (record.kind === "message_delete") {
    return {
      ...base,
      title: "Message deleted",
      description: `${mention(record.actorId)} deleted a message in ${channel(record.channelId)}.`,
      fields: [
        field("Author", mention(record.actorId), true),
        field("Message ID", record.messageId ?? "unknown", true),
        field("Content", data.content ?? "Content unavailable."),
      ],
    };
  }

  if (record.kind === "message_edit") {
    return {
      ...base,
      title: "Message edited",
      description: `${mention(record.actorId)} edited a message in ${channel(record.channelId)}.`,
      fields: [
        field("Author", mention(record.actorId), true),
        field("Message ID", record.messageId ?? "unknown", true),
        field("Before", data.before ?? "Content unavailable."),
        field("After", data.after ?? "Content unavailable."),
      ],
    };
  }

  if (record.kind === "member_join") {
    return {
      ...base,
      title: "Member joined",
      description: `${mention(record.targetId)} joined the server.`,
      fields: [
        field("Account age", data.accountAgeDays === undefined ? "unknown" : `${data.accountAgeDays} days`, true),
        field("Bot", data.bot === true ? "yes" : "no", true),
      ],
    };
  }

  if (record.kind === "member_leave") {
    return {
      ...base,
      title: "Member left",
      description: `${mention(record.targetId)} left the server.`,
      fields: [field("Joined", data.joinedAt ?? "unknown")],
    };
  }

  const caseNumber = data.caseNumber === undefined ? "unknown" : String(data.caseNumber);
  return {
    ...base,
    title: "Moderation case",
    description: `Case #${caseNumber} · ${text(data.action ?? "action", 100)}\n${text(record.summary, 3_500)}`,
    fields: [
      field("Target", mention(record.targetId), true),
      field("Actor", mention(record.actorId), true),
      field("Rule", data.rule ?? "manual", true),
      field("State", data.state ?? "open", true),
    ],
  };
}

/** A compact status card shared by setup, channel, events and disable. */
export function loggingStatusEmbed(settings: LoggingSettings, stored: number): EmbedPayload {
  const toggles = LOG_EVENTS.map(
    (event) => `${settings.events[event.key] ? "✅" : "❌"} ${event.label}`,
  ).join("\n");

  return {
    title: "Logging status",
    description: settings.enabled
      ? "Audit logging is enabled for this server."
      : "Audit logging is disabled. Run `/logging setup` to choose a channel.",
    color: settings.enabled ? 0x57f287 : 0xed4245,
    fields: [
      field("Channel", settings.channelId ? `<#${settings.channelId}>` : "Not set", true),
      field("Retention", `${settings.retentionDays} days`, true),
      field("Stored events", stored, true),
      field("Events", toggles),
    ],
    footer: {
      text: "Only enabled events are stored. Deleted and edited message content is retained until pruning.",
    },
  };
}
