import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleMemberStore } from "./member-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("SQL member state", () => {
  it("writes one members row and upserts verification without losing the join time", async () => {
    harness = await createMigratedPglite();
    const store = new DrizzleMemberStore(harness.db);

    expect(await store.get("guild-a", "user-1")).toBeUndefined();

    const first = await store.markVerified(
      "guild-a",
      "user-1",
      "2026-11-01T00:00:00.000Z",
    );
    expect(first).toMatchObject({
      guildId: "guild-a",
      userId: "user-1",
      quarantined: false,
      verifiedAt: "2026-11-01T00:00:00.000Z",
    });

    const rows = await harness.runner.query<{
      guild_id: string;
      user_id: string;
      quarantined: boolean;
    }>("select guild_id, user_id, quarantined from members");
    expect(rows).toEqual([{ guild_id: "guild-a", user_id: "user-1", quarantined: false }]);

    await harness.runner.exec(
      "update members set quarantined = true where guild_id = 'guild-a' and user_id = 'user-1'",
    );
    const second = await store.markVerified(
      "guild-a",
      "user-1",
      "2026-11-02T00:00:00.000Z",
    );
    expect(second.quarantined).toBe(false);
    expect(second.joinedAt).toBe(first.joinedAt);
    expect(second.verifiedAt).toBe("2026-11-02T00:00:00.000Z");
    expect(
      await harness.runner.query("select * from members where guild_id = 'guild-a'"),
    ).toHaveLength(1);
  });

  it("creates a quarantine row and clears a previous verification", async () => {
    harness = await createMigratedPglite();
    const store = new DrizzleMemberStore(harness.db);

    const held = await store.markQuarantined("guild-a", "user-2");
    expect(held).toMatchObject({
      guildId: "guild-a",
      userId: "user-2",
      quarantined: true,
    });
    expect(held.verifiedAt).toBeUndefined();

    await store.markVerified("guild-a", "user-2", "2026-11-01T00:00:00.000Z");
    const reheld = await store.markQuarantined("guild-a", "user-2");
    expect(reheld).toMatchObject({ quarantined: true });
    expect(reheld.verifiedAt).toBeUndefined();
    expect(reheld.joinedAt).toBe(held.joinedAt);
    expect(
      await harness.runner.query("select * from members where guild_id = 'guild-a'"),
    ).toHaveLength(1);
  });
});
