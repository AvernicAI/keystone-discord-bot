import { randomUUID } from "node:crypto";
import {
  UserError,
  type ModuleSettings,
  type MusicPlayback,
  type MusicPlaybackResult,
  type MusicPlaybackStatus,
  type MusicQueueAddResult,
  type MusicQueueClearResult,
  type MusicQueueRemoveResult,
  type MusicStore,
  type MusicTrack,
} from "@keystone/kernel";
import { musicSettingsSchema, type MusicSettings } from "./settings";

const MAX_QUERY_CHARS = 2_048;
const MAX_TITLE_CHARS = 100;

export const MUSIC_DISABLED_MESSAGE =
  "Music is disabled in this server. Enable it with `/config set module=music key=enabled value=true`.";

export interface MusicStatus {
  readonly settings: MusicSettings;
  readonly tracks: number;
  readonly playback: MusicPlaybackStatus;
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
 * A saved track is a URL and a label. It deliberately has no duration, artist
 * or "now playing" state: those would have to come from a playback backend,
 * and inventing them is exactly the kind of plausible fiction this pass must
 * avoid. Duplicate URLs are allowed — a queue may legitimately repeat a track.
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
    };
  }

  async list(guildId: string): Promise<{ settings: MusicSettings; tracks: readonly MusicTrack[] }> {
    const settings = await this.#requireEnabled(guildId);
    const queue = await this.store.list(guildId);
    return { settings, tracks: queue.tracks };
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
        `Saved queue is full (${settings.maxTracks} tracks). Remove one with \`/music remove position:<n>\` or raise \`music.maxTracks\` with \`/config set\`.`,
      );
    }
    return { settings, result };
  }

  async remove(guildId: string, position: number): Promise<MusicQueueRemoveResult> {
    await this.#requireEnabled(guildId);
    const result = await this.store.remove(guildId, position);
    if (!result.removed) {
      const current = await this.store.list(guildId);
      throw new UserError(
        current.tracks.length === 0
          ? "The saved queue is empty."
          : `No track at position ${position}. The saved queue has ${current.tracks.length} track${current.tracks.length === 1 ? "" : "s"}.`,
      );
    }
    return result;
  }

  async clear(guildId: string): Promise<MusicQueueClearResult> {
    await this.#requireEnabled(guildId);
    return this.store.clear(guildId);
  }

  async play(guildId: string, userId: string, query: string): Promise<MusicPlaybackResult> {
    await this.#requireEnabled(guildId);
    return this.#result(
      await this.playback.play({ guildId, userId, query }),
      "Nothing was played or saved.",
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
