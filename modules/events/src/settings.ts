import { z } from "zod";

/**
 * Event settings.
 *
 * Creating an event is an explicit operator action, so events are enabled by
 * default. The caps exist so a guild cannot turn one channel into an unbounded
 * table; `maxRsvpsPerEvent` also bounds the largest capacity an operator can
 * set, which keeps the reminder count and the export size predictable.
 *
 * `reminderLeadMinutes` is how far ahead of the start the 60-second tick posts
 * its one automatic reminder. It is a setting rather than a constant because a
 * community's idea of "soon" differs; five minutes to one week is the range
 * that stays useful without turning the tick into a second scheduler.
 */
export const eventSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxEvents: z.number().int().min(1).max(50).default(25),
  maxRsvpsPerEvent: z.number().int().min(1).max(5_000).default(500),
  reminderLeadMinutes: z.number().int().min(5).max(10_080).default(60),
});

export type EventSettings = z.infer<typeof eventSettingsSchema>;

export const eventDefaultSettings = eventSettingsSchema.parse({});
