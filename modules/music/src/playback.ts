import type {
  MusicEnqueueInput,
  MusicLoopMode,
  MusicPlayInput,
  MusicPlayback,
  MusicPlaybackResult,
  MusicPlaybackStatus,
  MusicPlayerSnapshot,
  MusicResumeInput,
} from "@keystone/kernel";

/**
 * The adapter used when the operator has not supplied a Lavalink node. It is
 * not a stub that returns success: every operation returns a named refusal, and
 * the reason is the same one `/music status` prints. The durable queue is still
 * real; it is simply not a player.
 */
export const PLAYBACK_UNAVAILABLE_REASON =
  "Playback is unavailable: no Lavalink node is configured. Start a node and set LAVALINK_URL and LAVALINK_PASSWORD; the save-only queue still works with /music add.";

export const PLAYBACK_MISSING = ["LAVALINK_URL", "LAVALINK_PASSWORD"] as const;

const refusal = (): MusicPlaybackResult => ({ ok: false, detail: PLAYBACK_UNAVAILABLE_REASON });

export class UnavailableMusicPlayback implements MusicPlayback {
  async status(): Promise<MusicPlaybackStatus> {
    return {
      available: false,
      backend: "none",
      configured: false,
      reason: PLAYBACK_UNAVAILABLE_REASON,
      missing: [...PLAYBACK_MISSING],
    };
  }

  async play(_input: MusicPlayInput): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async resume(_input: MusicResumeInput): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async enqueue(_input: MusicEnqueueInput): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async pause(_guildId: string, _paused: boolean): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async skip(_guildId: string): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async stop(_guildId: string): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async setVolume(_guildId: string, _volume: number): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async setLoop(_guildId: string, _mode: MusicLoopMode): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async shuffle(_guildId: string): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async jump(_guildId: string, _position: number): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async remove(_guildId: string, _position: number): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async clear(_guildId: string): Promise<MusicPlaybackResult> {
    return refusal();
  }

  async snapshot(_guildId: string): Promise<MusicPlayerSnapshot | undefined> {
    return undefined;
  }

  async show(_guildId: string, _channelId: string): Promise<MusicPlaybackResult> {
    return refusal();
  }
}
