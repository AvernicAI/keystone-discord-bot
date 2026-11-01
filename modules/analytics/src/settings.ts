import { z } from "zod";

/**
 * Analytics is read-only, so its settings are about the default view, not
 * data collection. It can be disabled like any other module; the command then
 * refuses rather than quietly returning a snapshot.
 */
export const analyticsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  defaultWindowDays: z.number().int().min(1).max(365).default(7),
});

export type AnalyticsSettings = z.infer<typeof analyticsSettingsSchema>;
export const analyticsDefaultSettings = analyticsSettingsSchema.parse({});
