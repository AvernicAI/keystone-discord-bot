/**
 * Music is a saved queue plus a playback port.
 *
 * The queue is real data and survives a restart when Postgres is configured.
 * Playback is a separate capability: a build without a voice client reports
 * that it cannot play and refuses, instead of showing a queue that pretends to
 * be audio. No module imports discord.js or a Lavalink client directly.
 */

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly uri: string;
  readonly requestedBy: string;
  readonly addedAt: string;
}

export interface MusicQueue {
  readonly guildId: string;
  readonly tracks: readonly MusicTrack[];
  readonly updatedAt: string;
}

/** Stable row identity in `community_records`; no new table is required. */
export const MUSIC_QUEUE_KIND = "music_queue";
export const MUSIC_QUEUE_KEY = "default";

export function emptyMusicQueue(guildId: string, updatedAt: string): MusicQueue {
  return { guildId, tracks: [], updatedAt };
}

export interface MusicQueueAddResult {
  readonly queue: MusicQueue;
  readonly added: boolean;
}

export interface MusicQueueRemoveResult {
  readonly queue: MusicQueue;
  readonly removed?: MusicTrack;
}

export interface MusicQueueClearResult {
  readonly queue: MusicQueue;
  readonly removed: number;
}

/**
 * Queue persistence. `add` is atomic and enforces the cap inside the store, so
 * two concurrent requests cannot both pass the last slot.
 */
export interface MusicStore {
  list(guildId: string): Promise<MusicQueue>;
  add(guildId: string, track: MusicTrack, maxTracks: number): Promise<MusicQueueAddResult>;
  remove(guildId: string, position: number): Promise<MusicQueueRemoveResult>;
  clear(guildId: string): Promise<MusicQueueClearResult>;
}

export interface MusicPlaybackStatus {
  readonly available: boolean;
  /** `none` until a real adapter is wired; never a brand name without a client. */
  readonly backend: string;
  readonly reason: string;
  readonly missing: readonly string[];
}

export interface MusicPlaybackResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface MusicPlayInput {
  readonly guildId: string;
  readonly userId: string;
  readonly query: string;
}

/**
 * The playback seam. A real implementation (for example a Lavalink client)
 * would answer `available: true`; the current build only ships the explicit
 * unavailable adapter. Commands never invent a success.
 */
export interface MusicPlayback {
  status(): Promise<MusicPlaybackStatus>;
  play(input: MusicPlayInput): Promise<MusicPlaybackResult>;
  skip(guildId: string): Promise<MusicPlaybackResult>;
  stop(guildId: string): Promise<MusicPlaybackResult>;
}

export interface MusicPort {
  readonly store: MusicStore;
  readonly playback: MusicPlayback;
}
