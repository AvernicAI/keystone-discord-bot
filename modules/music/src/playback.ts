import type {
  MusicPlayback,
  MusicPlaybackResult,
  MusicPlaybackStatus,
} from "@keystone/kernel";

/**
 * The only playback adapter in this build. It is not a stub that returns
 * success: every operation returns a named refusal, and the reason is the same
 * one `/music status` prints.
 *
 * Playback needs Discord's voice gateway plus an opus encoder/transport (or a
 * Lavalink client). Neither is in the dependency tree, no LAVALINK_URL is
 * configured, and this pass was not authorized to add one. The saved queue is
 * still real; it is simply not a player.
 */
export const PLAYBACK_UNAVAILABLE_REASON =
  "Playback is unavailable in this build: it has no Discord voice client or Lavalink client, and no LAVALINK_URL is configured. Tracks can be saved, but nothing can be played.";

export const PLAYBACK_MISSING = [
  "Discord voice client",
  "Lavalink client",
  "LAVALINK_URL",
] as const;

export class UnavailableMusicPlayback implements MusicPlayback {
  async status(): Promise<MusicPlaybackStatus> {
    return {
      available: false,
      backend: "none",
      reason: PLAYBACK_UNAVAILABLE_REASON,
      missing: [...PLAYBACK_MISSING],
    };
  }

  async play(): Promise<MusicPlaybackResult> {
    return { ok: false, detail: PLAYBACK_UNAVAILABLE_REASON };
  }

  async skip(): Promise<MusicPlaybackResult> {
    return { ok: false, detail: PLAYBACK_UNAVAILABLE_REASON };
  }

  async stop(): Promise<MusicPlaybackResult> {
    return { ok: false, detail: PLAYBACK_UNAVAILABLE_REASON };
  }
}
