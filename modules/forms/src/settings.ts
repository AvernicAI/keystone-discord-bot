import { z } from "zod";

/**
 * Form settings.
 *
 * Forms are enabled by default because creating one is an explicit operator
 * action; the caps exist so a guild cannot turn the review queue into an
 * unbounded table. `maxAnswerLength` is copied onto each field at creation, so
 * reducing it later cannot truncate answers that were already accepted.
 */
export const formSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxForms: z.number().int().min(1).max(50).default(25),
  maxFields: z.number().int().min(1).max(15).default(10),
  maxSubmissionsPerForm: z.number().int().min(1).max(10_000).default(500),
  maxAnswerLength: z.number().int().min(50).max(1_000).default(500),
});

export type FormSettings = z.infer<typeof formSettingsSchema>;

export const formDefaultSettings = formSettingsSchema.parse({});
