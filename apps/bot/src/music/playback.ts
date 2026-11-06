import { randomUUID } from "node:crypto";
import {
  UserError,
  type Logger,
  type ModuleSettings,
  type MusicEnqueueInput,
  type MusicLoopMode,
  type MusicPlayInput,
  type MusicPlayback,
  type MusicPlaybackResult,
  type MusicPlaybackStatus,
  type MusicPlayerSnapshot,
  type MusicPlayerState,
  type MusicQueue,
  type MusicResumeInput,
  type MusicStore,
  type MusicTrack,
} from "@keystone/kernel";
import { musicSettingsSchema } from "@keystone/module-music";
import type { VoiceEndReason, VoiceNode, VoicePlayer, VoiceTrack } from "./voice";

export interface MusicPanelRef {
  readonly channelId: string;
  readonly messageId: string;
}

export interface MusicPanelPublishInput {
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId?: string;
  readonly snapshot: MusicPlayerSnapshot;
  readonly queue: MusicQueue;
}

/** The bot-side card publisher; tests can pass `undefined` and drive audio only. */
export interface MusicPanelPort {
  publish(input: MusicPanelPublishInput): Promise<MusicPanelRef | undefined>;
}

interface Session {
  readonly guildId: string;
  voiceChannelId: string;
  textChannelId?: string;
  player?: VoicePlayer;
  current?: MusicTrack;
  encoded?: string;
  state: MusicPlayerState;
  positionMs: number;
  volume: number;
  loop: MusicLoopMode;
  panel?: MusicPanelRef;
  failures: number;
  idleTimer?: NodeJS.Timeout;
  lock: Promise<void>;
}

const MAX_CONSECUTIVE_FAILURES = 3;

function emptySession(guildId: string): Session {
  return {
    guildId,
    voiceChannelId: "",
    state: "idle",
    positionMs: 0,
    volume: 80,
    loop: "off",
    failures: 0,
    lock: Promise.resolve(),
  };
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 80;
  return Math.max(0, Math.min(200, Math.round(value)));
}

function httpsArtwork(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The http source has no tag reader, so Lavalink reports "Unknown title" for a
 * bare audio URL. A filename is a truthful fallback and much better than a
 * card that repeats "Unknown title" for every track.
 */
function titleFromUri(uri: string | undefined, fallback: string): string {
  if (!uri) return fallback;
  try {
    const url = new URL(uri);
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (!last) return fallback;
    const decoded = decodeURIComponent(last).replace(/\.[a-z0-9]{2,5}$/i, "");
    const cleaned = decoded.replace(/[-_]+/g, " ").trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

function trackFromVoice(track: VoiceTrack, requestedBy: string, query: string): MusicTrack {
  const info = track.info;
  const resolvedUri = info.uri ?? query;
  const reported = info.title?.trim();
  const title =
    reported && !/^unknown( title)?$/i.test(reported)
      ? reported
      : titleFromUri(resolvedUri, query);
  const author = info.author?.trim();
  const artist = author && !/^unknown( artist)?$/i.test(author) ? author : undefined;
  return {
    id: randomUUID(),
    title,
    uri: resolvedUri,
    requestedBy,
    addedAt: new Date().toISOString(),
    ...(info.length && info.length > 0 ? { durationMs: info.length } : {}),
    ...(artist ? { artist } : {}),
    ...(httpsArtwork(info.artworkUrl) ? { artworkUrl: httpsArtwork(info.artworkUrl) } : {}),
    ...(info.isStream ? { isStream: true } : {}),
    ...(info.sourceName ? { source: info.sourceName } : {}),
    ...(info.identifier ? { identifier: info.identifier } : {}),
  };
}

/**
 * The queue state machine. It owns the durable queue's play meaning and the
 * Lavalink player, but knows nothing about discord.js: `VoiceNode` is the
 * adapter seam, and the queue is the source of truth.
 *
 * Invariants:
 * - `tracks[0]` is the current track and stays there while it plays.
 * - A replacement (`REPLACED`) or our own stop (`STOPPED`) is not an end.
 * - Loop track replays without touching the row; loop queue rotates the head.
 * - A failure advances at most three times, then parks the player idle.
 */
export class QueueMusicPlayback implements MusicPlayback {
  readonly #sessions = new Map<string, Session>();

  constructor(
    private readonly node: VoiceNode,
    private readonly store: MusicStore,
    private readonly settings: ModuleSettings,
    private readonly logger: Logger,
    private readonly panel?: MusicPanelPort,
    private readonly now: () => number = Date.now,
  ) {}

  async status(): Promise<MusicPlaybackStatus> {
    try {
      const node = await this.node.status();
      return {
        available: node.available,
        backend: "lavalink",
        configured: true,
        reason: node.available
          ? `Lavalink node "${node.name}" is connected.`
          : node.detail ?? `Lavalink node "${node.name}" is not connected.`,
        missing: [],
        node,
      };
    } catch (error) {
      return {
        available: false,
        backend: "lavalink",
        configured: true,
        reason: error instanceof Error ? error.message : String(error),
        missing: [],
      };
    }
  }

  async play(input: MusicPlayInput): Promise<MusicPlaybackResult> {
    const settings = await this.#settings(input.guildId);
    const session = this.#session(input.guildId);
    return this.#exclusive(session, async () => {
      const joined = await this.#ensurePlayer(session, input.voiceChannelId, input.textChannelId, input.volume);
      if (!joined.ok) return joined;

      const resolved = await this.node.resolve(input.query);
      if (!resolved.ok || !resolved.track) {
        return { ok: false, detail: resolved.detail ?? "The node returned no track." };
      }
      const track = trackFromVoice(resolved.track, input.userId, input.query);
      const queue = await this.store.list(input.guildId);
      const insertAt = input.next ? Math.min(1, queue.tracks.length) : queue.tracks.length;
      const added = input.next
        ? await this.store.insertAt(input.guildId, insertAt, track, settings.maxTracks)
        : await this.store.add(input.guildId, track, settings.maxTracks);
      if (!added.added) {
        return {
          ok: false,
          detail: `The play queue is full (${settings.maxTracks}). Remove a track with /music remove or raise music.maxTracks.`,
        };
      }

      const position = insertAt + 1;
      const wasIdle = !session.current || session.state === "idle";
      if (wasIdle) {
        const started = await this.#startHead(session, settings);
        if (!started.ok) return started;
      } else {
        await this.#refreshPanel(session);
      }
      return { ok: true, position, playing: wasIdle, track };
    });
  }

  async resume(input: MusicResumeInput): Promise<MusicPlaybackResult> {
    const settings = await this.#settings(input.guildId);
    const session = this.#session(input.guildId);
    return this.#exclusive(session, async () => {
      const queue = await this.store.list(input.guildId);
      if (queue.tracks.length === 0) {
        return { ok: false, detail: "The saved queue is empty. Give /music play an http(s) URL." };
      }
      if (session.player && session.current && session.state !== "idle") {
        return { ok: true, playing: true, position: 1, track: session.current };
      }
      const joined = await this.#ensurePlayer(session, input.voiceChannelId, input.textChannelId, input.volume);
      if (!joined.ok) return joined;
      const started = await this.#startHead(session, settings);
      return started.ok
        ? { ok: true, playing: true, position: 1, track: started.track }
        : started;
    });
  }

  async enqueue(input: MusicEnqueueInput): Promise<MusicPlaybackResult> {
    const settings = await this.#settings(input.guildId);
    const session = this.#session(input.guildId);
    return this.#exclusive(session, async () => {
      const resolved = await this.node.resolve(input.query);
      if (!resolved.ok || !resolved.track) {
        return { ok: false, detail: resolved.detail ?? "The node returned no track." };
      }
      const track = trackFromVoice(resolved.track, input.userId, input.title || input.query);
      const queue = await this.store.list(input.guildId);
      const insertAt = input.next ? Math.min(1, queue.tracks.length) : queue.tracks.length;
      const added = input.next
        ? await this.store.insertAt(input.guildId, insertAt, track, settings.maxTracks)
        : await this.store.add(input.guildId, track, settings.maxTracks);
      if (!added.added) {
        return {
          ok: false,
          detail: `The play queue is full (${settings.maxTracks}). Remove a track with /music remove or raise music.maxTracks.`,
        };
      }
      await this.#refreshPanel(session);
      return { ok: true, position: insertAt + 1, playing: false, track };
    });
  }

  async pause(guildId: string, paused: boolean): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session?.player || !session.current) return nothingPlaying();
    return this.#exclusive(session, async () => {
      await session.player?.pause(paused);
      session.state = paused ? "paused" : "playing";
      await this.#refreshPanel(session);
      return { ok: true, detail: paused ? "Paused." : "Resumed." };
    });
  }

  async skip(guildId: string): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session?.player || !session.current) return nothingPlaying();
    return this.#exclusive(session, async () => {
      // A skip is an explicit advance; loop-track must not trap the caller on
      // the track they just asked to leave.
      const next = await this.#advance(session, false);
      return next.ok ? { ok: true, detail: "Skipped.", track: next.track } : next;
    });
  }

  async stop(guildId: string): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    return this.#exclusive(session, async () => {
      session.current = undefined;
      session.encoded = undefined;
      session.state = "idle";
      session.positionMs = 0;
      this.#clearIdle(session);
      await session.player?.stop().catch(() => undefined);
      await session.player?.destroy().catch(() => undefined);
      session.player = undefined;
      await this.node.leave(guildId).catch(() => undefined);
      await this.store.clear(guildId);
      await this.#refreshPanel(session);
      return { ok: true, detail: "Stopped and disconnected." };
    });
  }

  async clear(guildId: string): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    return this.#exclusive(session, async () => {
      session.current = undefined;
      session.encoded = undefined;
      session.state = "idle";
      session.positionMs = 0;
      await session.player?.stop().catch(() => undefined);
      await this.store.clear(guildId);
      await this.#refreshPanel(session);
      this.#scheduleIdle(session);
      return { ok: true, detail: "Queue cleared." };
    });
  }

  async setVolume(guildId: string, volume: number): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session?.player) return nothingPlaying();
    const next = clampVolume(volume);
    return this.#exclusive(session, async () => {
      await session.player?.setVolume(next);
      session.volume = next;
      await this.#refreshPanel(session);
      return { ok: true, detail: `Volume is ${next}%.` };
    });
  }

  async setLoop(guildId: string, mode: MusicLoopMode): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    return this.#exclusive(session, async () => {
      session.loop = mode;
      await this.#refreshPanel(session);
      return { ok: true, detail: `Loop is ${mode}.` };
    });
  }

  async shuffle(guildId: string): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    return this.#exclusive(session, async () => {
      const queue = await this.store.list(guildId);
      if (queue.tracks.length < 3) return { ok: false, detail: "There are fewer than three tracks to shuffle." };
      const [head, ...rest] = queue.tracks;
      for (let index = rest.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [rest[index], rest[swap]] = [rest[swap]!, rest[index]!];
      }
      await this.store.replace(guildId, [head!, ...rest]);
      await this.#refreshPanel(session);
      return { ok: true, detail: `Shuffled ${rest.length} upcoming track(s).` };
    });
  }

  async jump(guildId: string, position: number): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session?.player) return nothingPlaying();
    return this.#exclusive(session, async () => {
      const queue = await this.store.list(guildId);
      if (!Number.isInteger(position) || position < 1 || position > queue.tracks.length) {
        return { ok: false, detail: `No track at position ${position}.` };
      }
      const tracks = queue.tracks.slice(position - 1);
      await this.store.replace(guildId, tracks);
      // Replace the head, then start it; the skipped tracks are already gone
      // from the durable row, so a restart cannot replay them.
      await session.player?.stop().catch(() => undefined);
      const started = await this.#startHead(session, await this.#settings(guildId));
      return started.ok
        ? { ok: true, detail: `Jumped to position ${position}.`, track: started.track }
        : started;
    });
  }

  async remove(guildId: string, position: number): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    return this.#exclusive(session, async () => {
      if (position === 1 && session.player && session.current) {
        const next = await this.#advance(session, false);
        return next.ok ? { ok: true, detail: "Removed the current track.", track: next.track } : next;
      }
      const removed = await this.store.remove(guildId, position);
      if (!removed.removed) return { ok: false, detail: `No track at position ${position}.` };
      await this.#refreshPanel(session);
      return { ok: true, detail: `Removed ${removed.removed.title}.`, track: removed.removed };
    });
  }

  async snapshot(guildId: string): Promise<MusicPlayerSnapshot | undefined> {
    const session = this.#sessions.get(guildId);
    if (!session) return undefined;
    return this.#snapshot(session, await this.store.list(guildId));
  }

  activeGuilds(): readonly string[] {
    return [...this.#sessions.entries()]
      .filter(([, session]) => Boolean(session.player) || session.state !== "idle")
      .map(([guildId]) => guildId);
  }

  async show(guildId: string, channelId: string): Promise<MusicPlaybackResult> {
    const session = this.#sessions.get(guildId);
    if (!session) return nothingPlaying();
    session.textChannelId = channelId;
    if (session.panel && session.panel.channelId !== channelId) session.panel = undefined;
    await this.#refreshPanel(session);
    return session.panel
      ? { ok: true, detail: "Player card posted." }
      : { ok: false, detail: "I could not post the player card in that channel. Check Send Messages." };
  }

  async #settings(guildId: string): Promise<ReturnType<typeof musicSettingsSchema.parse>> {
    return musicSettingsSchema.parse(await this.settings.get(guildId));
  }

  #session(guildId: string): Session {
    const existing = this.#sessions.get(guildId);
    if (existing) return existing;
    const created = emptySession(guildId);
    this.#sessions.set(guildId, created);
    return created;
  }

  async #ensurePlayer(
    session: Session,
    voiceChannelId: string,
    textChannelId: string | undefined,
    volume: number,
  ): Promise<MusicPlaybackResult> {
    if (!voiceChannelId) return { ok: false, detail: "Join a voice channel first." };
    if (session.player && session.voiceChannelId && session.voiceChannelId !== voiceChannelId) {
      return {
        ok: false,
        detail: `I am already playing in <#${session.voiceChannelId}>. Join that channel or run /music stop.`,
      };
    }
    session.voiceChannelId = voiceChannelId;
    if (textChannelId && textChannelId !== session.textChannelId) {
      session.textChannelId = textChannelId;
      session.panel = undefined;
    }
    if (session.player) return { ok: true };

    try {
      const player = await this.node.join({ guildId: session.guildId, voiceChannelId, deaf: true });
      session.player = player;
      session.volume = clampVolume(volume);
      await player.setVolume(session.volume);
      player.onStart(() => {
        session.state = "playing";
        session.failures = 0;
        void this.#refreshPanel(session);
      });
      player.onEnd((reason) => this.#onEnd(session, reason));
      player.onException((message) => this.#onFailure(session, message));
      player.onStuck(() => this.#onFailure(session, "The track got stuck."));
      player.onClosed((reason) => {
        session.player = undefined;
        session.current = undefined;
        session.encoded = undefined;
        session.state = "idle";
        this.logger.warn("music player closed", { guildId: session.guildId, reason });
        void this.#refreshPanel(session);
      });
      return { ok: true };
    } catch (error) {
      session.voiceChannelId = "";
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async #startHead(
    session: Session,
    settings: ReturnType<typeof musicSettingsSchema.parse>,
  ): Promise<MusicPlaybackResult> {
    if (!session.player) return { ok: false, detail: "Join a voice channel first." };
    for (;;) {
      const queue = await this.store.list(session.guildId);
      const head = queue.tracks[0];
      if (!head) {
        session.current = undefined;
        session.encoded = undefined;
        session.state = "idle";
        session.positionMs = 0;
        await session.player?.stop().catch(() => undefined);
        await this.#refreshPanel(session);
        this.#scheduleIdle(session);
        return { ok: false, detail: "The queue is empty." };
      }
      const resolved = await this.node.resolve(head.uri);
      if (!resolved.ok || !resolved.track) {
        session.failures += 1;
        if (session.failures > MAX_CONSECUTIVE_FAILURES) {
          session.state = "idle";
          session.current = undefined;
          await this.#refreshPanel(session);
          return { ok: false, detail: resolved.detail ?? "The node could not resolve this track." };
        }
        await this.store.shift(session.guildId);
        continue;
      }
      session.current = head;
      session.encoded = resolved.track.encoded;
      session.state = "playing";
      session.positionMs = 0;
      await session.player.play(resolved.track.encoded);
      await this.#refreshPanel(session);
      return { ok: true, playing: true, position: 1, track: head };
    }
  }

  async #advance(session: Session, applyLoop = true): Promise<MusicPlaybackResult> {
    const queue = await this.store.list(session.guildId);
    if (queue.tracks.length === 0) {
      session.state = "idle";
      session.current = undefined;
      session.encoded = undefined;
      await this.#refreshPanel(session);
      this.#scheduleIdle(session);
      return nothingPlaying();
    }
    if (
      applyLoop &&
      session.loop === "track" &&
      session.current &&
      session.encoded &&
      session.player
    ) {
      await session.player.play(session.encoded);
      session.state = "playing";
      await this.#refreshPanel(session);
      return { ok: true, track: session.current };
    }
    if (applyLoop && session.loop === "queue" && queue.tracks.length > 0) {
      const [head, ...rest] = queue.tracks;
      await this.store.replace(session.guildId, [...rest, head!]);
      const started = await this.#startHead(session, await this.#settings(session.guildId));
      return started;
    }
    await this.store.shift(session.guildId);
    const started = await this.#startHead(session, await this.#settings(session.guildId));
    if (!started.ok) {
      session.state = "idle";
      session.current = undefined;
      session.encoded = undefined;
      await this.#refreshPanel(session);
      this.#scheduleIdle(session);
    }
    return started;
  }

  #onEnd(session: Session, reason: VoiceEndReason): void {
    if (reason === "REPLACED" || reason === "STOPPED") return;
    if (reason === "CLEANUP") {
      session.state = "idle";
      void this.#refreshPanel(session);
      return;
    }
    void this.#exclusive(session, async () => {
      if (reason === "LOAD_FAILED") {
        session.failures += 1;
        if (session.failures > MAX_CONSECUTIVE_FAILURES) {
          session.state = "idle";
          await session.player?.stop().catch(() => undefined);
          await this.#refreshPanel(session);
          return;
        }
      }
      await this.#advance(session);
    });
  }

  #onFailure(session: Session, message: string): void {
    this.logger.warn("music track failed", { guildId: session.guildId, message });
    void this.#exclusive(session, async () => {
      session.failures += 1;
      if (session.failures > MAX_CONSECUTIVE_FAILURES) {
        session.state = "idle";
        await session.player?.stop().catch(() => undefined);
        await this.#refreshPanel(session);
        return;
      }
      await this.#advance(session);
    });
  }

  #scheduleIdle(session: Session): void {
    this.#clearIdle(session);
    void this.#settings(session.guildId)
      .then((settings) => {
        session.idleTimer = setTimeout(() => {
          if (session.state !== "idle" || session.current) return;
          void this.#leaveIdle(session);
        }, settings.idleLeaveSeconds * 1_000);
        session.idleTimer.unref?.();
      })
      .catch((error: unknown) => {
        this.logger.warn("music idle timer was not scheduled", {
          guildId: session.guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  #clearIdle(session: Session): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
  }

  async #leaveIdle(session: Session): Promise<void> {
    if (session.state !== "idle" || session.current) return;
    await session.player?.destroy().catch(() => undefined);
    session.player = undefined;
    await this.node.leave(session.guildId).catch(() => undefined);
    this.logger.info("music left an idle voice channel", { guildId: session.guildId });
    await this.#refreshPanel(session);
  }

  async #refreshPanel(session: Session): Promise<void> {
    if (!this.panel || !session.textChannelId) return;
    const queue = await this.store.list(session.guildId);
    const snapshot = this.#snapshot(session, queue);
    try {
      const ref = await this.panel.publish({
        guildId: session.guildId,
        channelId: session.textChannelId,
        ...(session.panel ? { messageId: session.panel.messageId } : {}),
        snapshot,
        queue,
      });
      if (ref) session.panel = ref;
    } catch (error) {
      this.logger.warn("music panel was not updated", {
        guildId: session.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #snapshot(session: Session, queue?: MusicQueue): MusicPlayerSnapshot {
    const position = session.player
      ? Math.max(0, Math.round(session.player.position || 0))
      : session.positionMs;
    session.positionMs = position;
    return {
      guildId: session.guildId,
      voiceChannelId: session.voiceChannelId,
      ...(session.textChannelId ? { textChannelId: session.textChannelId } : {}),
      state: session.state,
      ...(session.current ? { track: session.current } : {}),
      positionMs: position,
      volume: session.volume,
      loop: session.loop,
      queueCount: queue?.tracks.length ?? 0,
      updatedAt: new Date(this.now()).toISOString(),
      ...(session.panel
        ? {
            panelChannelId: session.panel.channelId,
            panelMessageId: session.panel.messageId,
          }
        : {}),
    };
  }

  async #exclusive<T>(session: Session, fn: () => Promise<T>): Promise<T> {
    const run = session.lock.then(fn, fn);
    session.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function nothingPlaying(): MusicPlaybackResult {
  return { ok: false, detail: "Nothing is playing. Use /music play with an http(s) URL." };
}

/** A small helper for command code that needs the same refusal. */
export function requireMusicPlayback(value: MusicPlayback | undefined): MusicPlayback {
  if (!value) throw new UserError("Music is not wired in this process.");
  return value;
}
