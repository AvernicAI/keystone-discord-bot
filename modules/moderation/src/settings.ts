import { z } from "zod";

/**
 * Moderation settings are deliberately conservative.
 *
 * `dryRun` is true by default: a fresh install must not kick, ban, delete or
 * quarantine anyone before an operator has seen what the rules would do. The
 * security engine still records what it saw and alerts the mod-log channel;
 * that is observation, not enforcement.
 */
export const moderationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  dryRun: z.boolean().default(true),
  modLogChannelId: z.string().min(1).optional(),
  quarantineRoleId: z.string().min(1).optional(),
  appealsEnabled: z.boolean().default(true),
  antiRaid: z
    .object({
      joinsPerWindow: z.number().int().min(3).max(100).default(10),
      windowMs: z.number().int().min(10_000).max(600_000).default(60_000),
      raidMinutes: z.number().int().min(1).max(60).default(5),
      minAccountAgeDays: z.number().int().min(0).max(365).default(7),
      quarantine: z.boolean().default(true),
    })
    .default({}),
  antiNuke: z
    .object({
      actionsPerWindow: z.number().int().min(1).max(100).default(3),
      windowMs: z.number().int().min(10_000).max(600_000).default(60_000),
      webhookThreshold: z.number().int().min(1).max(10).default(1),
      quarantineActor: z.boolean().default(true),
    })
    .default({}),
  automod: z
    .object({
      invites: z.enum(["off", "alert", "delete", "timeout"]).default("delete"),
      links: z.enum(["off", "alert", "delete"]).default("off"),
      linkBlocklist: z.array(z.string().trim().min(1).max(253)).max(200).default([]),
      profanity: z.enum(["off", "alert", "delete"]).default("off"),
      bannedWords: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
      zalgo: z.enum(["off", "alert", "delete"]).default("off"),
      zalgoThreshold: z.number().int().min(1).max(100).default(8),
      maxMentions: z.number().int().min(0).max(50).default(8),
      duplicateWindowMs: z.number().int().min(1_000).max(600_000).default(30_000),
      duplicateThreshold: z.number().int().min(2).max(20).default(3),
    })
    .default({}),
  joinGate: z
    .object({
      enabled: z.boolean().default(false),
      minAccountAgeDays: z.number().int().min(0).max(365).default(7),
      timeoutMinutes: z.number().int().min(1).max(1_440).default(10),
    })
    .default({}),
  nativeAutoMod: z
    .object({
      sync: z.boolean().default(false),
    })
    .default({}),
});

export type ModerationSettings = z.infer<typeof moderationSettingsSchema>;

/** Parsing an empty object is the single source of truth for every default. */
export const moderationDefaultSettings = moderationSettingsSchema.parse({});
