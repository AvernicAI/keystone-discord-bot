import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite } from "./testing";
import { DrizzleCommunityStore } from "./community-store";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keystone-economy-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("Drizzle economy ledger", () => {
  it("persists derived balances through a close/reopen and refuses duplicate debits", async () => {
    const dir = await tempDir();
    const first = await createMigratedPglite(dir);
    const store = new DrizzleCommunityStore(first.db as never);

    await store.addLedger({
      guildId: "guild-a",
      userId: "user-a",
      amount: 100,
      reason: "seed",
      idempotencyKey: "seed",
    });
    expect(
      await store.spend({
        guildId: "guild-a",
        userId: "user-a",
        amount: 30,
        reason: "shop:vip",
        idempotencyKey: "spend-1",
      }),
    ).toMatchObject({ ok: true, inserted: true, balance: 70 });
    expect(
      await store.spend({
        guildId: "guild-a",
        userId: "user-a",
        amount: 30,
        reason: "shop:vip",
        idempotencyKey: "spend-1",
      }),
    ).toMatchObject({ ok: true, inserted: false, balance: 70 });
    expect(await store.getBalance("guild-a", "user-a")).toBe(70);

    await store.transfer({
      guildId: "guild-a",
      fromUserId: "user-a",
      toUserId: "user-b",
      amount: 20,
      reason: "transfer",
      idempotencyKey: "transfer-1",
    });
    await first.close();

    const second = await createMigratedPglite(dir);
    const reopened = new DrizzleCommunityStore(second.db as never);
    expect(await reopened.getBalance("guild-a", "user-a")).toBe(50);
    expect((await reopened.listLedger("guild-a", "user-a", 10)).map((row) => row.amount)).toEqual([
      -20,
      -30,
      100,
    ]);
    expect(
      await reopened.spend({
        guildId: "guild-a",
        userId: "user-a",
        amount: 51,
        reason: "too-much",
        idempotencyKey: "spend-2",
      }),
    ).toMatchObject({ ok: false, balance: 50, reason: "Not enough currency." });
    await second.close();
  });

  it("serializes concurrent transfers so a balance cannot go negative", async () => {
    const harness = await createMigratedPglite();
    const store = new DrizzleCommunityStore(harness.db as never);
    await store.addLedger({
      guildId: "guild-a",
      userId: "user-a",
      amount: 100,
      reason: "seed",
      idempotencyKey: "seed-concurrent",
    });

    const results = await Promise.all([
      store.transfer({
        guildId: "guild-a",
        fromUserId: "user-a",
        toUserId: "user-b",
        amount: 80,
        reason: "transfer",
        idempotencyKey: "concurrent-a",
      }),
      store.transfer({
        guildId: "guild-a",
        fromUserId: "user-a",
        toUserId: "user-c",
        amount: 80,
        reason: "transfer",
        idempotencyKey: "concurrent-b",
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await store.getBalance("guild-a", "user-a")).toBe(20);
    await harness.close();
  });
});
