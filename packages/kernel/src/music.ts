/**
 * Music is one durable play queue and one player behind a port.
 *
 * The queue is real data and survives a restart when Postgres is configured.
 * The current track is the head of that queue: it stays there while it plays
 * and is removed only when it ends, is skipped or is removed. The card and the
 * dashboard read the same `MusicPlayerSnapshot`; neither invents a progress
 * value. No module imports discord.js, Lavalink or Redis directly.
 */

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly uri: string;
  readonly requestedBy: string;
  readonly addedAt: string;
  /** Optional metadata from the resolver; a saved URL may not have it yet. */
  readonly durationMs?: number;
  readonly artist?: string;
  readonly artworkUrl?: string;
  readonly isStream?: boolean;
  readonly source?: string;
  readonly identifier?: string;
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

export interface MusicQueueInsertResult {
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

export interface MusicQueueShiftResult {
  readonly queue: MusicQueue;
  readonly removed?: MusicTrack;
}

/**
 * Queue persistence. `add` and `insertAt` enforce the cap inside the store, so
 * two concurrent requests cannot both claim the last slot. `replace` is the
 * single atomic write behind shuffle and loop rotation.
 */
export interface MusicStore {
  list(guildId: string): Promise<MusicQueue>;
  add(guildId: string, track: MusicTrack, maxTracks: number): Promise<MusicQueueAddResult>;
  insertAt(
    guildId: string,
    index: number,
    track: MusicTrack,
    maxTracks: number,
  ): Promise<MusicQueueInsertResult>;
  replace(guildId: string, tracks: readonly MusicTrack[]): Promise<MusicQueue>;
  remove(guildId: string, position: number): Promise<MusicQueueRemoveResult>;
  shift(guildId: string): Promise<MusicQueueShiftResult>;
  clear(guildId: string): Promise<MusicQueueClearResult>;
}

export type MusicLoopMode = "off" | "track" | "queue";
export type MusicPlayerState = "playing" | "paused" | "idle" | "reconnecting";

export interface MusicPlayerSnapshot {
  readonly guildId: string;
  readonly voiceChannelId: string;
  readonly textChannelId?: string;
  readonly state: MusicPlayerState;
  readonly track?: MusicTrack;
  readonly positionMs: number;
  readonly volume: number;
  readonly loop: MusicLoopMode;
  readonly queueCount: number;
  readonly updatedAt: string;
  /** The live card's location, when one was posted. */
  readonly panelChannelId?: string;
  readonly panelMessageId?: string;
}

export interface MusicNodeStatus {
  readonly name: string;
  readonly available: boolean;
  readonly version?: string;
  readonly players?: number;
  readonly playingPlayers?: number;
  readonly pingMs?: number;
  readonly detail?: string;
}

export interface MusicPlaybackStatus {
  readonly available: boolean;
  /** `none`, or the real backend name once a node is configured. */
  readonly backend: string;
  /** True when a URL/password was supplied, even if the node is down. */
  readonly configured: boolean;
  readonly reason: string;
  readonly missing: readonly string[];
  readonly node?: MusicNodeStatus;
}

export interface MusicPlaybackResult {
  readonly ok: boolean;
  readonly detail?: string;
  /** 1-based queue position, when a track was accepted. */
  readonly position?: number;
  /** True when this request started the player rather than only queued. */
  readonly playing?: boolean;
  readonly track?: MusicTrack;
}

export interface MusicConnectInput {
  readonly guildId: string;
  readonly voiceChannelId: string;
  readonly textChannelId?: string;
}

export interface MusicPlayInput extends MusicConnectInput {
  readonly userId: string;
  readonly query: string;
  readonly maxTracks: number;
  readonly volume: number;
  readonly next?: boolean;
}

export interface MusicResumeInput extends MusicConnectInput {
  readonly userId: string;
  readonly volume: number;
}

export interface MusicEnqueueInput {
  readonly guildId: string;
  readonly userId: string;
  readonly query: string;
  readonly maxTracks: number;
  readonly next?: boolean;
  /** Optional label used only when the resolver cannot supply a title. */
  readonly title?: string;
}

/** One global node status plus one per-guild player snapshot. */
export interface MusicPlayback {
  status(): Promise<MusicPlaybackStatus>;
  play(input: MusicPlayInput): Promise<MusicPlaybackResult>;
  resume(input: MusicResumeInput): Promise<MusicPlaybackResult>;
  enqueue(input: MusicEnqueueInput): Promise<MusicPlaybackResult>;
  pause(guildId: string, paused: boolean): Promise<MusicPlaybackResult>;
  skip(guildId: string): Promise<MusicPlaybackResult>;
  stop(guildId: string): Promise<MusicPlaybackResult>;
  setVolume(guildId: string, volume: number): Promise<MusicPlaybackResult>;
  setLoop(guildId: string, mode: MusicLoopMode): Promise<MusicPlaybackResult>;
  shuffle(guildId: string): Promise<MusicPlaybackResult>;
  jump(guildId: string, position: number): Promise<MusicPlaybackResult>;
  remove(guildId: string, position: number): Promise<MusicPlaybackResult>;
  clear(guildId: string): Promise<MusicPlaybackResult>;
  snapshot(guildId: string): Promise<MusicPlayerSnapshot | undefined>;
  /** Guilds with a live session; the dashboard reporter reads only these. */
  activeGuilds?(): readonly string[];
  /** Post or refresh the live card in a text channel, without changing audio. */
  show(guildId: string, channelId: string): Promise<MusicPlaybackResult>;
}

export interface MusicPort {
  readonly store: MusicStore;
  readonly playback: MusicPlayback;
}

// --- web control plane -----------------------------------------------------

export type MusicControlAction =
  | "play"
  | "resume"
  | "pause"
  | "skip"
  | "stop"
  | "shuffle"
  | "loop"
  | "volume"
  | "remove";

export interface MusicControlRequest {
  readonly id: string;
  readonly guildId: string;
  readonly actorId: string;
  readonly source: "web";
  readonly action: MusicControlAction;
  readonly query?: string;
  readonly voiceChannelId?: string;
  readonly textChannelId?: string;
  readonly value?: string | number;
  readonly requestedAt: string;
}

export interface MusicControlReply {
  readonly ok: boolean;
  /** Safe to show to the operator; never a token or a raw provider error. */
  readonly message: string;
  readonly code?: string;
}

export interface MusicControlState {
  readonly guildId: string;
  readonly reportedAt: string;
  readonly node: MusicNodeStatus;
  readonly player?: MusicPlayerSnapshot;
  /** The same durable queue the commands read; the panel never invents tracks. */
  readonly queue: MusicQueue;
}

/**
 * A small request/reply bus between the optional web process and the bot. The
 * bot owns the queue and voice socket; the web never gets a Discord client.
 */
export interface MusicControlBus {
  publishState(state: MusicControlState): Promise<void>;
  readState(guildId: string): Promise<MusicControlState | undefined>;
  /** A short-lived liveness key, so the dashboard can say "bot offline". */
  publishHeartbeat(at: string): Promise<void>;
  readHeartbeat(): Promise<string | undefined>;
  request(request: MusicControlRequest): Promise<MusicControlReply>;
  /** Start the bot-side receive loop. Idempotent. */
  serve(handler: (request: MusicControlRequest) => Promise<MusicControlReply>): void;
  close(): Promise<void>;
}
