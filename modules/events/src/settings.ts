import { z } from "zod";

/**
 * Event settings.
 *
 * Creating an event is an explicit operator action, so events are enabled by
 * default. The caps exist so a guild cannot turn one channel into an unbounded
 * table; `maxRsvpsPerEvent` also bounds the largest capacity an operator can
 * set, which keeps the reminder count and the export size predictable.
 */
export const eventSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxEvents: z.number().int().min(1).max(50).default(25),
  maxRsvpsPerEvent: z.number().int().min(1).max(5_000).default(500),
});

export type EventSettings = z.infer<typeof eventSettingsSchema>;

export const eventDefaultSettings = eventSettingsSchema.parse({});
