import { afterEach, describe, expect, it } from "vitest";
import type { MusicTrack } from "@keystone/kernel";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleMusicStore } from "./music-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

function track(id: string, guildId = "guild-a"): MusicTrack {
  return {
    id,
    title: `Track ${id}`,
    uri: `https://example.com/${id}.mp3`,
    requestedBy: "user-1",
    addedAt: "2026-11-01T00:00:00.000Z",
  };
}

async function store(): Promise<DrizzleMusicStore> {
  harness = await createMigratedPglite();
  return new DrizzleMusicStore(harness.db);
}

describe("SQL music queue", () => {
  it("stores real rows in community_records and round-trips them", async () => {
    const queue = await store();
    expect(await queue.list("guild-a")).toMatchObject({ guildId: "guild-a", tracks: [] });

    await queue.add("guild-a", track("one"), 5);
    await queue.add("guild-a", track("two"), 5);
    const after = await queue.list("guild-a");
    expect(after.tracks.map((row) => row.id)).toEqual(["one", "two"]);

    const rows = await harness?.runner.query<{
      guild_id: string;
      kind: string;
      key: string;
      data: { tracks: unknown[] };
    }>(
      "select guild_id, kind, key, data from community_records where guild_id = 'guild-a'",
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ guild_id: "guild-a", kind: "music_queue", key: "default" });
    expect(rows?.[0]?.data.tracks).toHaveLength(2);

    const removed = await queue.remove("guild-a", 1);
    expect(removed.removed?.id).toBe("one");
    expect((await queue.list("guild-a")).tracks.map((row) => row.id)).toEqual(["two"]);

    const cleared = await queue.clear("guild-a");
    expect(cleared.removed).toBe(1);
    expect((await queue.list("guild-a")).tracks).toHaveLength(0);
    expect(
      await harness?.runner.query("select * from community_records where guild_id = 'guild-a'"),
    ).toEqual([]);
  });

  it("enforces the cap atomically under concurrent adds", async () => {
    const queue = await store();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => queue.add("guild-a", track(String(index)), 3)),
    );

    expect(results.filter((result) => result.added)).toHaveLength(3);
    expect((await queue.list("guild-a")).tracks).toHaveLength(3);
  });

  it("keeps each guild's saved queue isolated", async () => {
    const queue = await store();
    await queue.add("guild-a", track("a", "guild-a"), 3);
    await queue.add("guild-b", track("b", "guild-b"), 3);

    expect((await queue.list("guild-a")).tracks.map((row) => row.id)).toEqual(["a"]);
    expect((await queue.list("guild-b")).tracks.map((row) => row.id)).toEqual(["b"]);
  });
});
