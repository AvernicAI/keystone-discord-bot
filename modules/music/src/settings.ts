import { z } from "zod";

/**
 * Music is off by default. The module is useful only after an operator supplies
 * a Lavalink node and a server enables it; installing the module must not
 * advertise a player that is not there.
 *
 * `maxTracks` is enforced by the store, not only by the command. `djRoleIds` is
 * a comma/space separated list because Discord has no portable role picker in a
 * slash command; the dashboard's generated form edits the same string.
 */
export const musicSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  maxTracks: z.number().int().min(1).max(500).default(100),
  djOnly: z.boolean().default(false),
  djRoleIds: z.string().max(500).default(""),
  defaultVolume: z.number().int().min(0).max(200).default(80),
  idleLeaveSeconds: z.number().int().min(10).max(600).default(45),
});

export type MusicSettings = z.infer<typeof musicSettingsSchema>;
export const musicDefaultSettings = musicSettingsSchema.parse({});

/** Parse the saved role list once; empty strings and duplicates disappear. */
export function parseDjRoleIds(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => /^\d{15,20}$/.test(entry)),
    ),
  ];
}
