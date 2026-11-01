import { randomUUID } from "node:crypto";
import { UserError } from "@keystone/kernel";
import type {
  CommunityActions,
  CommunityStore,
  CooldownStore,
  LevelProfile,
} from "@keystone/kernel";
import type { CommunitySettings } from "./settings";

export function levelForXp(xp: number): number {
  return Math.max(0, Math.floor(xp / 100));
}

export interface XpResult {
  readonly awarded: number;
  readonly profile: LevelProfile;
  readonly levelUp: boolean;
  readonly rewards: readonly string[];
}

export class LevelingService {
  readonly #lastXp = new Map<string, number>();

  constructor(
    private readonly store: CommunityStore,
    private readonly actions: CommunityActions,
    private readonly settings: CommunitySettings,
    private readonly now: () => number = Date.now,
    private readonly rng: () => number = Math.random,
  ) {}

  async awardMessageXp(
    guildId: string,
    userId: string,
    messageId: string,
  ): Promise<XpResult> {
    const cooldownKey = `${guildId}:${userId}`;
    const now = this.now();
    const last = this.#lastXp.get(cooldownKey);
    if (last !== undefined && now - last < this.settings.xp.cooldownMs) {
      const profile =
        (await this.store.getLevel(guildId, userId)) ??
        zeroProfile(guildId, userId);
      return { awarded: 0, profile, levelUp: false, rewards: [] };
    }
    this.#lastXp.set(cooldownKey, now);

    const span = this.settings.xp.maxPerMessage - this.settings.xp.minPerMessage;
    const base =
      this.settings.xp.minPerMessage + Math.floor(this.rng() * (span + 1));
    const amount = Math.max(1, Math.round(base * this.settings.xp.multiplier));
    const result = await this.store.awardXp({
      guildId,
      userId,
      amount,
      source: "message",
      idempotencyKey: `xp:${guildId}:${messageId}`,
    });
    if (!result.inserted) {
      return { awarded: 0, profile: result.profile, levelUp: false, rewards: [] };
    }

    const oldLevel = result.profile.level;
    const newLevel = levelForXp(result.profile.xp);
    let profile = result.profile;
    const rewards: string[] = [];

    if (newLevel > oldLevel) {
      profile = await this.store.setLevel(guildId, userId, newLevel, result.profile.xp);
      for (const reward of this.settings.xp.rewards) {
        if (reward.level <= newLevel && reward.level > oldLevel) {
          rewards.push(reward.roleId);
          try {
            await this.actions.addRole(
              guildId,
              userId,
              reward.roleId,
              `Level ${reward.level} reward`,
            );
          } catch {
            // A role can be deleted or sit above the bot. XP still landed; the
            // reward is reported so an operator can repair the role hierarchy.
          }
        }
      }
    }

    return {
      awarded: amount,
      profile,
      levelUp: newLevel > oldLevel,
      rewards,
    };
  }

  async rank(
    guildId: string,
    userId: string,
  ): Promise<{ profile: LevelProfile; rank: number | undefined }> {
    const profile =
      (await this.store.getLevel(guildId, userId)) ?? zeroProfile(guildId, userId);
    const top = await this.store.topLevels(guildId, 100);
    const index = top.findIndex((row) => row.userId === userId);
    return { profile, rank: index >= 0 ? index + 1 : undefined };
  }

  leaderboard(guildId: string, limit = 10): Promise<LevelProfile[]> {
    return this.store.topLevels(guildId, limit);
  }

  setLevel(guildId: string, userId: string, level: number): Promise<LevelProfile> {
    if (!Number.isInteger(level) || level < 0) {
      throw new UserError("Level must be a non-negative integer.");
    }
    return this.store.setLevel(guildId, userId, level, level * 100);
  }
}

function zeroProfile(guildId: string, userId: string): LevelProfile {
  return { guildId, userId, xp: 0, level: 0, updatedAt: new Date().toISOString() };
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  roleId?: string;
  description?: string;
}

export class EconomyService {
  constructor(
    private readonly store: CommunityStore,
    private readonly actions: CommunityActions,
    private readonly settings: CommunitySettings,
    private readonly now: () => number = Date.now,
    private readonly rng: () => number = Math.random,
    private readonly cooldowns?: CooldownStore,
  ) {}

  balance(guildId: string, userId: string): Promise<number> {
    return this.store.getBalance(guildId, userId);
  }

  shop(): ShopItem[] {
    return this.settings.economy.shop;
  }

  async daily(
    guildId: string,
    userId: string,
  ): Promise<{ ok: boolean; amount: number; balance: number; reason?: string }> {
    const now = this.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const amount = this.settings.economy.dailyAmount;
    if (this.cooldowns) {
      const date = new Date(now);
      const nextDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
      const gate = await this.cooldowns.hit(
        `economy:daily:${guildId}:${userId}`,
        Math.max(1_000, nextDay - now),
        now,
      );
      if (!gate.allowed) {
        return {
          ok: false,
          amount: 0,
          balance: await this.store.getBalance(guildId, userId),
          reason: "Daily already claimed; come back tomorrow.",
        };
      }
    }
    const result = await this.store.addLedger({
      guildId,
      userId,
      amount,
      reason: "daily",
      idempotencyKey: `daily:${guildId}:${userId}:${day}`,
    });
    if (!result.inserted) {
      return {
        ok: false,
        amount: 0,
        balance: result.balance,
        reason: "Daily already claimed; come back tomorrow.",
      };
    }
    return { ok: true, amount, balance: result.balance };
  }

  async transfer(
    guildId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    requestId: string = randomUUID(),
  ): Promise<{ ok: boolean; fromBalance: number; toBalance: number; reason?: string }> {
    if (fromUserId === toUserId) throw new UserError("You cannot pay yourself.");
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new UserError("Amount must be a positive whole number.");
    }
    if (amount > this.settings.economy.transferMax) {
      throw new UserError(`The maximum transfer is ${this.settings.economy.transferMax}.`);
    }
    if (await this.actions.isBot(guildId, toUserId)) {
      throw new UserError("You cannot pay a bot.");
    }
    const result = await this.store.transfer({
      guildId,
      fromUserId,
      toUserId,
      amount,
      reason: "transfer",
      idempotencyKey: `transfer:${guildId}:${requestId}`,
    });
    return result;
  }

  async buy(
    guildId: string,
    userId: string,
    itemId: string,
    requestId: string = randomUUID(),
  ): Promise<{ ok: boolean; item?: ShopItem; balance?: number; reason?: string }> {
    const item = this.shop().find((entry) => entry.id === itemId);
    if (!item) throw new UserError("That shop item does not exist.");
    if (item.roleId && (await this.actions.hasRole(guildId, userId, item.roleId))) {
      return { ok: false, item, reason: "You already own that role." };
    }
    const result = await this.store.spend({
      guildId,
      userId,
      amount: item.price,
      reason: `shop:${item.id}`,
      idempotencyKey: `buy:${guildId}:${userId}:${item.id}:${requestId}`,
    });
    if (!result.ok) {
      return { ok: false, item, balance: result.balance, reason: result.reason };
    }
    if (item.roleId) {
      const granted = await this.actions.addRole(
        guildId,
        userId,
        item.roleId,
        `Shop purchase: ${item.name}`,
      );
      if (!granted.ok) {
        return {
          ok: false,
          item,
          balance: result.balance,
          reason: "Purchase recorded, but the role grant failed; ask an admin to repair it.",
        };
      }
    }
    return { ok: true, item, balance: result.balance };
  }

  async gamble(
    guildId: string,
    userId: string,
    bet: number,
    requestId: string = randomUUID(),
  ): Promise<{ ok: boolean; won?: boolean; amount?: number; balance?: number; reason?: string }> {
    if (!this.settings.economy.gambling) {
      throw new UserError("Gambling is disabled in this server.");
    }
    if (!Number.isInteger(bet) || bet <= 0) {
      throw new UserError("Bet must be a positive whole number.");
    }
    if (bet > this.settings.economy.gambleMax) {
      throw new UserError(`The maximum bet is ${this.settings.economy.gambleMax}.`);
    }
    const won = this.rng() < 0.45;
    const delta = won ? bet : -bet;
    if (won) {
      const result = await this.store.addLedger({
        guildId,
        userId,
        amount: delta,
        reason: "gamble:win",
        idempotencyKey: `gamble:${guildId}:${userId}:${requestId}`,
      });
      if (!result.inserted) {
        return { ok: false, balance: result.balance, reason: "That gamble was already recorded." };
      }
      return { ok: true, won, amount: delta, balance: result.balance };
    }
    const result = await this.store.spend({
      guildId,
      userId,
      amount: bet,
      reason: "gamble:loss",
      idempotencyKey: `gamble:${guildId}:${userId}:${requestId}`,
    });
    if (!result.ok) return { ok: false, balance: result.balance, reason: result.reason };
    if (!result.inserted) {
      return { ok: false, balance: result.balance, reason: "That gamble was already recorded." };
    }
    return { ok: true, won, amount: delta, balance: result.balance };
  }

  ledger(guildId: string, userId: string, limit = 10) {
    return this.store.listLedger(guildId, userId, limit);
  }
}
