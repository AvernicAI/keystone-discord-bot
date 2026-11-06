import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  MUSIC_QUEUE_KEY,
  MUSIC_QUEUE_KIND,
  emptyMusicQueue,
  type MusicQueue,
  type MusicQueueAddResult,
  type MusicQueueClearResult,
  type MusicQueueInsertResult,
  type MusicQueueRemoveResult,
  type MusicQueueShiftResult,
  type MusicStore,
  type MusicTrack,
} from "@keystone/kernel";
import { communityRecords, guilds } from "./schema";
import type { schema } from "./schema";

type RecordRow = typeof communityRecords.$inferSelect;

const nowIso = (): string => new Date().toISOString();

function isTrack(value: unknown): value is MusicTrack {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return (
    typeof track.id === "string" &&
    typeof track.title === "string" &&
    typeof track.uri === "string" &&
    typeof track.requestedBy === "string" &&
    typeof track.addedAt === "string"
  );
}

function tracksFrom(row: RecordRow | undefined): MusicTrack[] {
  if (!row) return [];
  const data = row.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  const tracks = (data as { tracks?: unknown }).tracks;
  return Array.isArray(tracks) ? tracks.filter(isTrack).map((track) => ({ ...track })) : [];
}

function toQueue(row: RecordRow | undefined, guildId: string): MusicQueue {
  if (!row) return emptyMusicQueue(guildId, nowIso());
  return {
    guildId,
    tracks: tracksFrom(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Postgres play queue. It reuses `community_records` rather than adding a
 * `music_queue` table: the row is `(guild, music_queue, default)` and its JSON
 * payload is the ordered track list, with the current track at the head. The
 * guild row lock serializes concurrent writes so the cap cannot be exceeded by
 * a lost update.
 */
export class DrizzleMusicStore implements MusicStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async list(guildId: string): Promise<MusicQueue> {
    const [row] = await this.db
      .select()
      .from(communityRecords)
      .where(
        and(
          eq(communityRecords.guildId, guildId),
          eq(communityRecords.kind, MUSIC_QUEUE_KIND),
          eq(communityRecords.key, MUSIC_QUEUE_KEY),
        ),
      )
      .limit(1);
    return toQueue(row, guildId);
  }

  async add(guildId: string, track: MusicTrack, maxTracks: number): Promise<MusicQueueAddResult> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      const current = toQueue(await this.#read(tx, guildId), guildId);
      if (current.tracks.length >= maxTracks) {
        return { queue: current, added: false };
      }
      const next: MusicQueue = {
        ...current,
        tracks: [...current.tracks, track],
        updatedAt: nowIso(),
      };
      await this.#save(tx, guildId, next.tracks);
      return { queue: next, added: true };
    });
  }

  async insertAt(
    guildId: string,
    index: number,
    track: MusicTrack,
    maxTracks: number,
  ): Promise<MusicQueueInsertResult> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      const current = toQueue(await this.#read(tx, guildId), guildId);
      if (current.tracks.length >= maxTracks) {
        return { queue: current, added: false };
      }
      const tracks = [...current.tracks];
      const at = Math.max(0, Math.min(Number.isInteger(index) ? index : tracks.length, tracks.length));
      tracks.splice(at, 0, track);
      const next = { ...current, tracks, updatedAt: nowIso() };
      await this.#save(tx, guildId, next.tracks);
      return { queue: next, added: true };
    });
  }

  async replace(guildId: string, tracks: readonly MusicTrack[]): Promise<MusicQueue> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      if (tracks.length === 0) {
        await this.#delete(tx, guildId);
      } else {
        await this.#save(tx, guildId, tracks);
      }
      return { guildId, tracks: tracks.map((track) => ({ ...track })), updatedAt: nowIso() };
    });
  }

  async remove(guildId: string, position: number): Promise<MusicQueueRemoveResult> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      const current = toQueue(await this.#read(tx, guildId), guildId);
      if (!Number.isInteger(position) || position < 1 || position > current.tracks.length) {
        return { queue: current };
      }
      const tracks = [...current.tracks];
      const [removed] = tracks.splice(position - 1, 1);
      if (tracks.length === 0) await this.#delete(tx, guildId);
      else await this.#save(tx, guildId, tracks);
      return {
        queue: { guildId, tracks, updatedAt: nowIso() },
        removed,
      };
    });
  }

  async shift(guildId: string): Promise<MusicQueueShiftResult> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      const current = toQueue(await this.#read(tx, guildId), guildId);
      if (current.tracks.length === 0) return { queue: current };
      const tracks = [...current.tracks];
      const removed = tracks.shift();
      if (tracks.length === 0) await this.#delete(tx, guildId);
      else await this.#save(tx, guildId, tracks);
      return {
        queue: { guildId, tracks, updatedAt: nowIso() },
        removed,
      };
    });
  }

  async clear(guildId: string): Promise<MusicQueueClearResult> {
    return this.db.transaction(async (tx) => {
      await this.#lockGuild(tx, guildId);
      const removed = tracksFrom(await this.#read(tx, guildId)).length;
      await this.#delete(tx, guildId);
      return { queue: emptyMusicQueue(guildId, nowIso()), removed };
    });
  }

  async #read(
    tx: PgDatabase<any, typeof schema>,
    guildId: string,
  ): Promise<RecordRow | undefined> {
    const [row] = await tx
      .select()
      .from(communityRecords)
      .where(
        and(
          eq(communityRecords.guildId, guildId),
          eq(communityRecords.kind, MUSIC_QUEUE_KIND),
          eq(communityRecords.key, MUSIC_QUEUE_KEY),
        ),
      )
      .limit(1);
    return row;
  }

  async #save(
    tx: PgDatabase<any, typeof schema>,
    guildId: string,
    tracks: readonly MusicTrack[],
  ): Promise<void> {
    await tx
      .insert(communityRecords)
      .values({
        guildId,
        kind: MUSIC_QUEUE_KIND,
        key: MUSIC_QUEUE_KEY,
        data: { tracks },
      })
      .onConflictDoUpdate({
        target: [communityRecords.guildId, communityRecords.kind, communityRecords.key],
        set: { data: { tracks }, updatedAt: new Date() },
      });
  }

  async #delete(tx: PgDatabase<any, typeof schema>, guildId: string): Promise<void> {
    await tx
      .delete(communityRecords)
      .where(
        and(
          eq(communityRecords.guildId, guildId),
          eq(communityRecords.kind, MUSIC_QUEUE_KIND),
          eq(communityRecords.key, MUSIC_QUEUE_KEY),
        ),
      );
  }

  /** Serialize queue mutations for one guild with the existing guild row. */
  async #lockGuild(tx: PgDatabase<any, typeof schema>, guildId: string): Promise<void> {
    await tx.insert(guilds).values({ id: guildId }).onConflictDoNothing();
    await tx.select({ id: guilds.id }).from(guilds).where(eq(guilds.id, guildId)).for("update");
  }
}
