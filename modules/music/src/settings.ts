import { z } from "zod";

/**
 * Music is off by default. The saved queue is useful before a playback backend
 * exists, but it should not appear configured just because the module is
 * installed. `maxTracks` is enforced by the store, not only by the command.
 */
export const musicSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  maxTracks: z.number().int().min(1).max(100).default(25),
});

export type MusicSettings = z.infer<typeof musicSettingsSchema>;
export const musicDefaultSettings = musicSettingsSchema.parse({});
