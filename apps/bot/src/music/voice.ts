import type { MusicNodeStatus } from "@keystone/kernel";

/**
 * The narrow voice contract the player session needs. The Shoukaku adapter is
 * the only implementation in production; tests inject a fake that records the
 * same calls and emits the same events. The queue never knows which one it has.
 */
export interface VoiceTrackInfo {
  readonly identifier: string;
  readonly title: string;
  readonly author?: string;
  readonly length?: number;
  readonly uri?: string;
  readonly artworkUrl?: string;
  readonly isStream?: boolean;
  readonly sourceName?: string;
}

export interface VoiceTrack {
  readonly encoded: string;
  readonly info: VoiceTrackInfo;
}

export interface VoiceResolveResult {
  readonly ok: boolean;
  readonly track?: VoiceTrack;
  readonly detail?: string;
}

export type VoiceEndReason =
  | "FINISHED"
  | "LOAD_FAILED"
  | "STOPPED"
  | "REPLACED"
  | "CLEANUP"
  | "UNKNOWN";

export interface VoicePlayer {
  readonly paused: boolean;
  readonly position: number;
  play(encoded: string): Promise<void>;
  pause(paused: boolean): Promise<void>;
  stop(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  destroy(): Promise<void>;
  onStart(handler: () => void): void;
  onEnd(handler: (reason: VoiceEndReason) => void): void;
  onException(handler: (message: string) => void): void;
  onStuck(handler: () => void): void;
  onClosed(handler: (reason: string) => void): void;
}

export interface VoiceJoinInput {
  readonly guildId: string;
  readonly voiceChannelId: string;
  readonly deaf?: boolean;
}

export interface VoiceNode {
  status(): Promise<MusicNodeStatus>;
  resolve(query: string): Promise<VoiceResolveResult>;
  join(input: VoiceJoinInput): Promise<VoicePlayer>;
  leave(guildId: string): Promise<void>;
  close(): Promise<void>;
}
