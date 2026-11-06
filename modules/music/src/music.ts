import { randomUUID } from "node:crypto";
import {
  UserError,
  type ModuleSettings,
  type MusicLoopMode,
  type MusicPlayback,
  type MusicPlaybackResult,
  type MusicPlaybackStatus,
  type MusicPlayerSnapshot,
  type MusicQueueAddResult,
  type MusicQueueClearResult,
  type MusicQueueRemoveResult,
  type MusicStore,
  type MusicTrack,
} from "@keystone/kernel";
import { musicSettingsSchema, parseDjRoleIds, type MusicSettings } from "./settings";

const MAX_QUERY_CHARS = 2_048;
const MAX_TITLE_CHARS = 100;

export const MUSIC_DISABLED_MESSAGE =
  "Music is disabled in this server. Enable it with `/config set module=music key=enabled value=true`.";

export interface MusicStatus {
  readonly settings: MusicSettings;
  readonly tracks: number;
  readonly playback: MusicPlaybackStatus;
  readonly player?: MusicPlayerSnapshot;
}

export interface MusicPlayInput {
  readonly guildId: string;
  readonly userId: string;
  readonly query?: string;
  readonly voiceChannelId: string;
  readonly textChannelId?: string;
  readonly next?: boolean;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodedName(pathname: string): string | undefined {
  const raw = pathname.split("/").filter(Boolean).at(-1);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * A saved track is a URL and a label. A resolved track carries the extra
 * metadata Lavalink supplied; neither invents a duration or an artist.
 * Duplicate URLs are allowed: a queue may legitimately repeat a track.
 */
export function parseTrack(input: {
  readonly query: string;
  readonly title?: string;
  readonly requestedBy: string;
  readonly now: number;
}): MusicTrack {
  const query = input.query.trim();
  if (!query) throw new UserError("Provide an audio URL to save.");
  if (query.length > MAX_QUERY_CHARS) {
    throw new UserError(`The URL is longer than ${MAX_QUERY_CHARS} characters.`);
  }

  let url: URL;
  try {
    url = new URL(query);
  } catch {
    throw new UserError("That is not a URL. Use an http or https link to an audio file.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UserError("Only http and https audio links can be saved.");
  }
  if (url.username || url.password) {
    throw new UserError("Remove the username and password from the URL before saving it.");
  }

  const title = oneLine(input.title ?? "") || decodedName(url.pathname) || url.hostname;
  return {
    id: randomUUID(),
    title: clip(title || "Saved track", MAX_TITLE_CHARS),
    uri: query,
    requestedBy: input.requestedBy,
    addedAt: new Date(input.now).toISOString(),
  };
}

/**
 * The DJ gate is deliberately small and inspectable: an administrator or
 * Manage Server holder always counts, a configured role counts, and everyone
 * else is refused when `djOnly` is on. It does not guess whether the caller is
 * alone in a voice channel; the adapter does not expose the channel's members.
 */
export function isDj(
  settings: Pick<MusicSettings, "djOnly" | "djRoleIds">,
  member: { readonly permissions: readonly string[]; readonly roleIds?: readonly string[] },
): boolean {
  if (!settings.djOnly) return true;
  if (member.permissions.includes("Administrator") || member.permissions.includes("ManageGuild")) {
    return true;
  }
  const roles = new Set(member.roleIds ?? []);
  return parseDjRoleIds(settings.djRoleIds).some((roleId) => roles.has(roleId));
}

export const DJ_REFUSAL =
  "Only a DJ can use that control. Ask an admin for the DJ role, or turn off `music.djOnly`.";

/**
 * Music policy. A disabled module refuses every queue and playback operation
 * except `/music status`, so installing the module never silently advertises a
 * feature the operator did not turn on. Playback results are propagated, not
 * guessed: `ok:false` becomes a `UserError` with the adapter's exact reason.
 */
export class MusicService {
  constructor(
    private readonly store: MusicStore,
    private readonly playback: MusicPlayback,
    private readonly settings: ModuleSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async status(guildId: string): Promise<MusicStatus> {
    const settings = await this.#settings(guildId);
    const queue = await this.store.list(guildId);
    return {
      settings,
      tracks: queue.tracks.length,
      playback: await this.playback.status(),
      player: await this.playback.snapshot(guildId),
    };
  }

  async list(guildId: string): Promise<{ settings: MusicSettings; tracks: readonly MusicTrack[] }> {
    const settings = await this.#requireEnabled(guildId);
    const queue = await this.store.list(guildId);
    return { settings, tracks: queue.tracks };
  }

  async snapshot(guildId: string): Promise<MusicPlayerSnapshot | undefined> {
    return this.playback.snapshot(guildId);
  }

  async add(
    guildId: string,
    userId: string,
    query: string,
    title?: string,
  ): Promise<{ settings: MusicSettings; result: MusicQueueAddResult }> {
    const settings = await this.#requireEnabled(guildId);
    const track = parseTrack({ query, title, requestedBy: userId, now: this.now() });
    const result = await this.store.add(guildId, track, settings.maxTracks);
    if (!result.added) {
      throw new UserError(
        `Play queue is full (${settings.maxTracks} tracks). Remove one with \`/music remove position:<n>\` or raise \`music.maxTracks\` with \`/config set\`.`,
      );
    }
    return { settings, result };
  }

  async remove(guildId: string, position: number): Promise<MusicQueueRemoveResult> {
    await this.#requireEnabled(guildId);
    const before = await this.store.list(guildId);
    // A live player must see the removal: position 1 is a skip, and the
    // adapter already knows how to advance. Without a player, the durable row
    // is still editable, so fall through to the store.
    const played = await this.playback
      .remove(guildId, position)
      .catch((): MusicPlaybackResult => ({ ok: false }));
    if (played.ok) {
      const removed = played.track ?? before.tracks[position - 1];
      return {
        queue: await this.store.list(guildId),
        ...(removed ? { removed } : {}),
      };
    }
    const result = await this.store.remove(guildId, position);
    if (!result.removed) {
      const current = await this.store.list(guildId);
      throw new UserError(
        current.tracks.length === 0
          ? "The play queue is empty."
          : `No track at position ${position}. The queue has ${current.tracks.length} track${current.tracks.length === 1 ? "" : "s"}.`,
      );
    }
    return result;
  }

  async clear(guildId: string): Promise<MusicQueueClearResult> {
    await this.#requireEnabled(guildId);
    const before = await this.store.list(guildId);
    // Tell a live player to stop its audio, but never let a missing backend
    // stop the durable rows from being cleared.
    await this.playback.clear(guildId).catch(() => ({ ok: false }));
    const cleared = await this.store.clear(guildId);
    return { removed: before.tracks.length, queue: cleared.queue };
  }

  /**
   * `/music play` with a query joins voice, resolves one track and queues it;
   * without a query it resumes the saved queue from its head. The player owns
   * both, so the command cannot accidentally create a second queue.
   */
  async play(input: MusicPlayInput): Promise<MusicPlaybackResult> {
    const settings = await this.#requireEnabled(input.guildId);
    if (!input.voiceChannelId) {
      throw new UserError("Join a voice channel first; I need to know where to play.");
    }
    if (input.query?.trim()) {
      return this.#result(
        await this.playback.play({
          guildId: input.guildId,
          userId: input.userId,
          query: input.query.trim(),
          voiceChannelId: input.voiceChannelId,
          ...(input.textChannelId ? { textChannelId: input.textChannelId } : {}),
          maxTracks: settings.maxTracks,
          volume: settings.defaultVolume,
          ...(input.next ? { next: true } : {}),
        }),
        "Nothing was played or queued.",
      );
    }

    const queue = await this.store.list(input.guildId);
    if (queue.tracks.length === 0) {
      throw new UserError(
        "The saved queue is empty. Give `/music play` an http(s) audio URL, or use `/music add` to build a queue.",
      );
    }
    return this.#result(
      await this.playback.resume({
        guildId: input.guildId,
        userId: input.userId,
        voiceChannelId: input.voiceChannelId,
        ...(input.textChannelId ? { textChannelId: input.textChannelId } : {}),
        volume: settings.defaultVolume,
      }),
      "Nothing resumed.",
    );
  }

  async pause(guildId: string, paused: boolean): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(
      await this.playback.pause(guildId, paused),
      paused ? "Nothing was paused." : "Nothing was resumed.",
    );
  }

  async skip(guildId: string): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.skip(guildId), "Nothing was skipped.");
  }

  async stop(guildId: string): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.stop(guildId), "Nothing was stopped.");
  }

  async setVolume(guildId: string, volume: number): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.setVolume(guildId, volume), "Volume was not changed.");
  }

  async setLoop(guildId: string, mode: MusicLoopMode): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.setLoop(guildId, mode), "Loop was not changed.");
  }

  async shuffle(guildId: string): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.shuffle(guildId), "Nothing was shuffled.");
  }

  async jump(guildId: string, position: number): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.jump(guildId, position), "Nothing was jumped to.");
  }

  async show(guildId: string, channelId: string): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(await this.playback.show(guildId, channelId), "The card was not posted.");
  }

  async playbackStatus(): Promise<MusicPlaybackStatus> {
    return this.playback.status();
  }

  async #result(result: MusicPlaybackResult, prefix: string): Promise<MusicPlaybackResult> {
    if (!result.ok) {
      const status = await this.playback.status();
      throw new UserError(`${prefix} ${result.detail ?? status.reason}`);
    }
    return result;
  }

  async #requireEnabled(guildId: string): Promise<MusicSettings> {
    const settings = await this.#settings(guildId);
    if (!settings.enabled) throw new UserError(MUSIC_DISABLED_MESSAGE);
    return settings;
  }

  async #settings(guildId: string): Promise<MusicSettings> {
    return musicSettingsSchema.parse(await this.settings.get(guildId));
  }
}
