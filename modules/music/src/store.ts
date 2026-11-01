import {
  emptyMusicQueue,
  type MusicQueue,
  type MusicQueueAddResult,
  type MusicQueueClearResult,
  type MusicQueueRemoveResult,
  type MusicStore,
  type MusicTrack,
} from "@keystone/kernel";

const nowIso = (): string => new Date().toISOString();

/**
 * In-memory saved queue. It is a real store for the supported local mode, not a
 * mock: entries survive for the process lifetime, the cap is enforced, and
 * mutations are serialized per guild so two concurrent adds cannot both claim
 * the last slot.
 */
export class InMemoryMusicStore implements MusicStore {
  readonly #queues = new Map<string, MusicQueue>();
  readonly #locks = new Map<string, Promise<void>>();

  async list(guildId: string): Promise<MusicQueue> {
    return this.#copy(this.#queues.get(guildId) ?? emptyMusicQueue(guildId, nowIso()));
  }

  async add(guildId: string, track: MusicTrack, maxTracks: number): Promise<MusicQueueAddResult> {
    return this.#exclusive(guildId, () => {
      const current = this.#queues.get(guildId) ?? emptyMusicQueue(guildId, nowIso());
      if (current.tracks.length >= maxTracks) {
        return { queue: this.#copy(current), added: false };
      }
      const next: MusicQueue = {
        ...current,
        tracks: [...current.tracks, track],
        updatedAt: nowIso(),
      };
      this.#queues.set(guildId, next);
      return { queue: this.#copy(next), added: true };
    });
  }

  async remove(guildId: string, position: number): Promise<MusicQueueRemoveResult> {
    return this.#exclusive(guildId, () => {
      const current = this.#queues.get(guildId) ?? emptyMusicQueue(guildId, nowIso());
      if (!Number.isInteger(position) || position < 1 || position > current.tracks.length) {
        return { queue: this.#copy(current) };
      }
      const tracks = [...current.tracks];
      const [removed] = tracks.splice(position - 1, 1);
      const updatedAt = nowIso();
      if (tracks.length === 0) this.#queues.delete(guildId);
      else this.#queues.set(guildId, { ...current, tracks, updatedAt });
      return {
        queue: this.#copy({ ...current, tracks, updatedAt }),
        removed,
      };
    });
  }

  async clear(guildId: string): Promise<MusicQueueClearResult> {
    return this.#exclusive(guildId, () => {
      const current = this.#queues.get(guildId);
      const removed = current?.tracks.length ?? 0;
      this.#queues.delete(guildId);
      return { queue: emptyMusicQueue(guildId, nowIso()), removed };
    });
  }

  #copy(queue: MusicQueue): MusicQueue {
    return { ...queue, tracks: queue.tracks.map((track) => ({ ...track })) };
  }

  async #exclusive<T>(guildId: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = this.#locks.get(guildId) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.#locks.set(guildId, settled);
    try {
      return await run;
    } finally {
      if (this.#locks.get(guildId) === settled) this.#locks.delete(guildId);
    }
  }
}
