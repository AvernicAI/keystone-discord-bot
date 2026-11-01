export { musicModule } from "./manifest";
export { music } from "./commands/music";
export {
  musicDefaultSettings,
  musicSettingsSchema,
  type MusicSettings,
} from "./settings";
export { InMemoryMusicStore } from "./store";
export {
  MusicService,
  MUSIC_DISABLED_MESSAGE,
  parseTrack,
  type MusicStatus,
} from "./music";
export {
  PLAYBACK_MISSING,
  PLAYBACK_UNAVAILABLE_REASON,
  UnavailableMusicPlayback,
} from "./playback";
