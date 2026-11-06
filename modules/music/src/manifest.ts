import { defineModule } from "@keystone/kernel";
import { music } from "./commands/music";
import { musicDefaultSettings, musicSettingsSchema } from "./settings";

/**
 * One durable play queue and one real Lavalink player.
 *
 * The queue is the play queue: its head is the current track. GuildVoiceStates
 * is requested only because the Shoukaku adapter joins a voice channel; without
 * LAVALINK_URL and LAVALINK_PASSWORD the composition root wires the explicit
 * unavailable adapter instead, and every sound operation says why.
 */
export const musicModule = defineModule({
  id: "music",
  name: "Music",
  description: "A durable play queue, a real Lavalink player and one signed player card.",
  version: "0.2.0",
  settingsSchema: musicSettingsSchema,
  defaultSettings: musicDefaultSettings,
  commands: [music],
  intents: ["Guilds", "GuildVoiceStates"],
  docsPath: "04-Modules/music/Spec.md",
});
