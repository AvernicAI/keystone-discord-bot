import { defineModule } from "@keystone/kernel";
import { music } from "./commands/music";
import { musicDefaultSettings, musicSettingsSchema } from "./settings";

/**
 * The last named root in the v1.0 plan, shipped honestly.
 *
 * The saved queue is real and persists in `community_records`. Playback is not
 * installed in this build: no voice or Lavalink client is in the dependency
 * tree, so the manifest does not request GuildVoiceStates and every playback
 * command refuses. A future playback adapter can be added behind the same port
 * without changing the command surface.
 */
export const musicModule = defineModule({
  id: "music",
  name: "Music",
  description: "A durable saved queue with explicit playback readiness; streaming is not installed.",
  version: "0.1.0",
  settingsSchema: musicSettingsSchema,
  defaultSettings: musicDefaultSettings,
  commands: [music],
  intents: ["Guilds"],
  docsPath: "04-Modules/music/Spec.md",
});
