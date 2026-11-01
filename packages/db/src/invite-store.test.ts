import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPgliteDatabase, type PgliteHarness } from "./testing";
import { migrate } from "./migrator";
import { DrizzleInviteStore } from "./invite-store";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keystone-invites-"));
  dirs.push(dir);
  return dir;
}

async function open(dir: string): Promise<PgliteHarness> {
  const harness = await createPgliteDatabase(dir);
  await migrate(harness.runner);
  return harness;
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("invite persistence", () => {
  it("counts joins, leaves and retention in SQL", async () => {
    const harness = await open(await tempDir());
    const store = new DrizzleInviteStore(harness.db);

    await store.recordJoin({
      guildId: "guild-a",
      userId: "member-1",
      inviterId: "inviter-a",
      code: "alpha",
      joinedAt: "2026-11-01T00:00:00.000Z",
    });
    await store.recordJoin({
      guildId: "guild-a",
      userId: "member-2",
      inviterId: "inviter-a",
      code: "alpha",
      joinedAt: "2026-11-01T00:01:00.000Z",
    });
    await store.recordJoin({
      guildId: "guild-a",
      userId: "member-3",
      inviterId: "inviter-b",
      code: "beta",
      joinedAt: "2026-11-01T00:02:00.000Z",
    });
    await store.recordLeave("guild-a", "member-2", "2026-11-02T00:00:00.000Z");

    expect(await store.leaderboard("guild-a", 10)).toEqual([
      { inviterId: "inviter-a", joins: 2, leaves: 1, retained: 1 },
      { inviterId: "inviter-b", joins: 1, leaves: 0, retained: 1 },
    ]);
    expect(await store.statsFor("guild-a", "inviter-a")).toEqual({
      inviterId: "inviter-a",
      joins: 2,
      leaves: 1,
      retained: 1,
    });
    expect(await store.statsFor("guild-a", "member-1")).toBeUndefined();
    await harness.close();
  });

  it("is idempotent for a repeated gateway delivery", async () => {
    const harness = await open(await tempDir());
    const store = new DrizzleInviteStore(harness.db);
    const join = {
      guildId: "guild-a",
      userId: "member-1",
      inviterId: "inviter-a",
      code: "alpha",
      joinedAt: "2026-11-01T00:00:00.000Z",
      fakeReasons: ["no-avatar"],
    };

    expect(await store.recordJoin(join)).toBe(true);
    expect(await store.recordJoin(join)).toBe(false);
    expect(await store.leaderboard("guild-a", 10)).toEqual([
      { inviterId: "inviter-a", joins: 1, leaves: 0, retained: 1 },
    ]);
    await harness.close();
  });

  it("returns the latest attributed join for a member", async () => {
    const harness = await open(await tempDir());
    const store = new DrizzleInviteStore(harness.db);

    await store.recordJoin({
      guildId: "guild-a",
      userId: "member-1",
      inviterId: "first",
      code: "one",
      joinedAt: "2026-11-01T00:00:00.000Z",
    });
    await store.recordLeave("guild-a", "member-1", "2026-11-02T00:00:00.000Z");
    await store.recordJoin({
      guildId: "guild-a",
      userId: "member-1",
      inviterId: "second",
      code: "two",
      joinedAt: "2026-11-03T00:00:00.000Z",
      fakeReasons: ["account-age"],
    });

    const latest = await store.invitee("guild-a", "member-1");
    expect(latest?.inviterId).toBe("second");
    expect(latest?.fakeReasons).toEqual(["account-age"]);
    expect(await store.invitee("guild-b", "member-1")).toBeUndefined();
    await harness.close();
  });

  it("survives a close and reopen on the same data directory", async () => {
    const dir = await tempDir();
    const first = await open(dir);
    await new DrizzleInviteStore(first.db).recordJoin({
      guildId: "guild-a",
      userId: "member-1",
      inviterId: "inviter-a",
      code: "alpha",
      joinedAt: "2026-11-01T00:00:00.000Z",
    });
    await first.close();

    const second = await open(dir);
    expect(await new DrizzleInviteStore(second.db).statsFor("guild-a", "inviter-a")).toMatchObject({
      joins: 1,
      retained: 1,
    });
    await second.close();
  });
});
