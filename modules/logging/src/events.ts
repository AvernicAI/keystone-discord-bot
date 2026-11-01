import type { LogEventKind } from "@keystone/kernel";

/** Settings keys for the five event toggles. */
export type LogEventSettingKey =
  | "messageDelete"
  | "messageEdit"
  | "memberJoin"
  | "memberLeave"
  | "moderationAction";

export interface LogEventMeta {
  readonly kind: LogEventKind;
  readonly key: LogEventSettingKey;
  readonly label: string;
  readonly description: string;
  readonly color: number;
}

/**
 * The single event table. The command choices, settings defaults, test
 * fixtures and embed renderer all read this, so adding a sixth event is one
 * entry plus its gateway translation.
 */
export const LOG_EVENTS: readonly LogEventMeta[] = [
  {
    kind: "message_delete",
    key: "messageDelete",
    label: "Message deleted",
    description: "A message was deleted.",
    color: 0xed4245,
  },
  {
    kind: "message_edit",
    key: "messageEdit",
    label: "Message edited",
    description: "A message's content changed.",
    color: 0xfee75c,
  },
  {
    kind: "member_join",
    key: "memberJoin",
    label: "Member joined",
    description: "A member joined the server.",
    color: 0x57f287,
  },
  {
    kind: "member_leave",
    key: "memberLeave",
    label: "Member left",
    description: "A member left the server.",
    color: 0xf0b232,
  },
  {
    kind: "moderation_action",
    key: "moderationAction",
    label: "Moderation case",
    description: "A moderator or security rule opened a case.",
    color: 0xeb459e,
  },
];

export const LOG_EVENT_CHOICES = LOG_EVENTS.map((event) => ({
  name: event.label,
  value: event.kind,
}));

export function logEventMeta(kind: string): LogEventMeta | undefined {
  return LOG_EVENTS.find((event) => event.kind === kind);
}
