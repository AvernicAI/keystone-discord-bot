import { z } from "zod";
import type { LogEventKind } from "@keystone/kernel";
import { logEventMeta } from "./events";

/**
 * Logging is off until an operator runs `/logging setup`. A fresh install must
 * never start storing message content because a module was present in the
 * registry.
 *
 * `channelId` is nullable: `/logging channel` without an option clears the
 * destination while keeping the event ledger. `retentionDays` is a real
 * retention promise, not decoration; the service prunes against it.
 */
export const loggingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: z.string().min(1).nullable().optional(),
  events: z
    .object({
      messageDelete: z.boolean().default(true),
      messageEdit: z.boolean().default(true),
      memberJoin: z.boolean().default(true),
      memberLeave: z.boolean().default(true),
      moderationAction: z.boolean().default(true),
    })
    .default({}),
  retentionDays: z.number().int().min(1).max(365).default(30),
});

export type LoggingSettings = z.infer<typeof loggingSettingsSchema>;
export const loggingDefaultSettings = loggingSettingsSchema.parse({});

export function eventEnabled(settings: LoggingSettings, kind: LogEventKind): boolean {
  const meta = logEventMeta(kind);
  return meta ? settings.events[meta.key] : false;
}

export function setEvent(
  settings: LoggingSettings,
  kind: LogEventKind,
  enabled: boolean,
): LoggingSettings {
  const meta = logEventMeta(kind);
  if (!meta) return settings;
  return {
    ...settings,
    events: { ...settings.events, [meta.key]: enabled },
  };
}
