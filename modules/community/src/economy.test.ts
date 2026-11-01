import { describe, expect, it } from "vitest";
import { InMemoryCooldownStore } from "@keystone/kernel";
import { communitySettingsSchema } from "./settings";
import { InMemoryCommunityStore } from "./store";
import { RecordingCommunityActions } from "./testing";
import { EconomyService } from "./progress";

const guild = "guild-a";
const user = "user-a";
const other = "user-b";

function settings(overrides: Record<string, unknown> = {}) {
  return communitySettingsSchema.parse(overrides);
}

function seed(store: InMemoryCommunityStore) {
  return store.addLedger({
    guildId: guild,
    userId: user,
    amount: 100,
    reason: "seed",
    idempotencyKey: "seed-economy",
  });
}

describe("ledger-backed economy hardening", () => {
  it("serializes two transfers that would otherwise double-spend", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    await seed(store);
    const service = new EconomyService(store, actions, settings(), () => 0, () => 0);

    const results = await Promise.all([
      service.transfer(guild, user, other, 80, "transfer-a"),
      service.transfer(guild, user, other, 80, "transfer-b"),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await service.balance(guild, user)).toBe(20);
    expect(await store.topBalances(guild, 10)).toEqual(
      expect.arrayContaining([
        { userId: user, balance: 20 },
        { userId: other, balance: 80 },
      ]),
    );
  });

  it("deduplicates a retried transfer by request id", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    await seed(store);
    const service = new EconomyService(store, actions, settings(), () => 0, () => 0);

    const [first, retry] = await Promise.all([
      service.transfer(guild, user, other, 40, "same-request"),
      service.transfer(guild, user, other, 40, "same-request"),
    ]);

    expect(first.ok).toBe(true);
    expect(retry).toMatchObject({ ok: true, fromBalance: 60, toBalance: 40 });
    expect(await service.balance(guild, user)).toBe(60);
    expect((await service.ledger(guild, user, 10)).filter((row) => row.reason === "transfer")).toHaveLength(1);
  });

  it("checks daily through the kernel cooldown port and permits the next UTC day", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    const cooldowns = new InMemoryCooldownStore();
    let now = 1_700_000_000_000;
    const service = new EconomyService(
      store,
      actions,
      settings({ economy: { dailyAmount: 25 } }),
      () => now,
      () => 0,
      cooldowns,
    );

    expect(await service.daily(guild, user)).toMatchObject({ ok: true, amount: 25, balance: 25 });
    expect(await service.daily(guild, user)).toMatchObject({ ok: false, amount: 0 });
    now += 86_400_000;
    expect(await service.daily(guild, user)).toMatchObject({ ok: true, amount: 25, balance: 50 });
  });

  it("refuses self-pay, bot targets, cap breaches and insufficient funds explicitly", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    await seed(store);
    actions.botIds.add("bot-1");
    const service = new EconomyService(
      store,
      actions,
      settings({ economy: { transferMax: 100 } }),
      () => 0,
      () => 0,
    );

    await expect(service.transfer(guild, user, user, 10)).rejects.toThrow(/pay yourself/i);
    await expect(service.transfer(guild, user, "bot-1", 10)).rejects.toThrow(/pay a bot/i);
    await expect(service.transfer(guild, user, other, 101)).rejects.toThrow(/maximum transfer/i);
    expect(await service.transfer(guild, user, other, 45)).toMatchObject({ ok: true });
    expect(await service.transfer(guild, user, other, 56)).toMatchObject({
      ok: false,
      reason: "Not enough currency.",
    });
    expect(await service.balance(guild, user)).toBe(55);
  });

  it("settles a losing gamble atomically and deduplicates it by request id", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    await seed(store);
    const service = new EconomyService(
      store,
      actions,
      settings({ economy: { gambling: true, gambleMax: 100 } }),
      () => 0,
      () => 0.99,
    );

    const results = await Promise.all([
      service.gamble(guild, user, 80, "gamble-1"),
      service.gamble(guild, user, 80, "gamble-1"),
    ]);
    expect(results[0]).toMatchObject({ ok: true, won: false, amount: -80 });
    expect(results[1]).toMatchObject({ ok: false, reason: "That gamble was already recorded." });
    expect(await service.balance(guild, user)).toBe(20);
    expect((await service.ledger(guild, user, 10)).filter((row) => row.reason === "gamble:loss")).toHaveLength(1);
  });

  it("debits shop purchases through the checked spend path once", async () => {
    const store = new InMemoryCommunityStore();
    const actions = new RecordingCommunityActions();
    await seed(store);
    const service = new EconomyService(
      store,
      actions,
      settings({ economy: { shop: [{ id: "vip", name: "VIP", price: 60, roleId: "role-vip" }] } }),
      () => 0,
      () => 0,
    );

    const first = await service.buy(guild, user, "vip", "buy-1");
    const retry = await service.buy(guild, user, "vip", "buy-1");
    expect(first).toMatchObject({ ok: true, balance: 40 });
    expect(retry).toMatchObject({ ok: false });
    expect(await service.balance(guild, user)).toBe(40);
    expect((await service.ledger(guild, user, 10)).filter((row) => row.reason === "shop:vip")).toHaveLength(1);
  });
});
