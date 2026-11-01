import { z } from "zod";

/**
 * Invite settings.
 *
 * Tracking is on by default because the feature is read-only and earns nothing
 * until an operator looks at it. The two flags are advisory: they record a
 * reason on the join row and post to the log channel, but never punish a member.
 */
export const inviteSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Where suspicious joins are reported. No channel means record-only. */
  logChannelId: z.string().min(1).optional(),
  /** Accounts younger than this are flagged. `0` disables the check. */
  minAccountAgeDays: z.number().int().min(0).max(365).default(7),
  /** Flag joins whose account has no profile avatar. */
  flagNoAvatar: z.boolean().default(true),
  leaderboardSize: z.number().int().min(1).max(25).default(10),
});

export type InviteSettings = z.infer<typeof inviteSettingsSchema>;

export const inviteDefaultSettings = inviteSettingsSchema.parse({});
