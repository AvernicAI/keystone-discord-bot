import { defineCommand, UserError, type CommandContext } from "@keystone/kernel";
import { EconomyService, LevelingService } from "../progress";
import { SeasonService } from "../extras";
import { action, integer, port, requirePermission, settingsFor, text, userId } from "./helpers";

const ACTIONS = [
  "view",
  "leaderboard",
  "rewards",
  "admin",
  "balance",
  "daily",
  "pay",
  "shop",
  "buy",
  "gamble",
  "ledger",
  "season",
] as const;

export const rank = defineCommand({
  name: "rank",
  description: "View levels, leaderboards, rewards, currency, shop and transfers.",
  options: [
    {
      type: "string",
      name: "action",
      description: "What to do",
      required: true,
      choices: ACTIONS.map((value) => ({ name: value, value })),
    },
    { type: "user", name: "user", description: "Member to look at or pay" },
    { type: "integer", name: "amount", description: "Coins to move or gamble", minValue: 1 },
    { type: "integer", name: "level", description: "Level for admin changes", minValue: 0 },
    { type: "string", name: "value", description: "Rewards as level:roleId,level:roleId" },
    { type: "string", name: "item", description: "Shop item id" },
    { type: "integer", name: "limit", description: "Rows to show", minValue: 1, maxValue: 25 },
    { type: "integer", name: "days", description: "Season length in days", minValue: 1, maxValue: 365 },
  ],
  guards: [
    (ctx) =>
      ctx.guildId
        ? { ok: true }
        : { ok: false, message: "This command only works in a server." },
  ],
  async execute(ctx: CommandContext): Promise<void> {
    const { store, actions } = port(ctx);
    const settings = await settingsFor(ctx);
    const leveling = new LevelingService(store, actions, settings, ctx.now);
    const economy = new EconomyService(store, actions, settings, ctx.now, Math.random, ctx.cooldowns);
    const guildId = ctx.guildId as string;
    const selected = action(ctx);

    if (selected === "view") {
      const target = userId(ctx, "user") ?? ctx.userId;
      const result = await leveling.rank(guildId, target);
      await ctx.interaction.reply({
        embeds: [
          {
            title: `<@${target}>`,
            description: `Level **${result.profile.level}** · **${result.profile.xp} XP**${
              result.rank ? ` · rank **#${result.rank}**` : ""
            }`,
            color: 0x5865f2,
          },
        ],
      });
      return;
    }

    if (selected === "leaderboard") {
      const rows = await leveling.leaderboard(guildId, integer(ctx, "limit") ?? 10);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "XP leaderboard",
            description:
              rows.length === 0
                ? "No XP recorded yet."
                : rows
                    .map(
                      (profile, index) =>
                        `${index + 1}. <@${profile.userId}> — level ${profile.level} (${profile.xp} XP)`,
                    )
                    .join("\n"),
            color: 0x5865f2,
          },
        ],
      });
      return;
    }

    if (selected === "rewards") {
      requirePermission(ctx, "ManageGuild");
      const value = text(ctx, "value");
      if (!value) {
        await ctx.interaction.reply({
          content:
            settings.xp.rewards.length === 0
              ? "No role rewards configured."
              : settings.xp.rewards.map((reward) => `Level ${reward.level}: <@&${reward.roleId}>`).join("\n"),
          ephemeral: true,
        });
        return;
      }
      const rewards = value.split(",").map((entry) => {
        const [level, roleId] = entry.split(":");
        const parsed = Number(level);
        if (!Number.isInteger(parsed) || parsed < 1 || !roleId) {
          throw new UserError("Rewards look like `5:123456789,10:987654321`.");
        }
        return { level: parsed, roleId };
      });
      await ctx.settings.update(guildId, { xp: { ...settings.xp, rewards } });
      await ctx.interaction.reply({ content: "XP role rewards updated.", ephemeral: true });
      return;
    }

    if (selected === "admin") {
      requirePermission(ctx, "ManageGuild");
      const target = userId(ctx, "user");
      const level = integer(ctx, "level");
      if (!target || level === undefined) throw new UserError("Admin needs a user and a level.");
      const profile = await leveling.setLevel(guildId, target, level);
      await ctx.interaction.reply({
        content: `<@${target}> is now level ${profile.level} with ${profile.xp} XP.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "balance") {
      const target = userId(ctx, "user") ?? ctx.userId;
      const balance = await economy.balance(guildId, target);
      await ctx.interaction.reply({
        content: `<@${target}> has **${balance} ${settings.economy.currency}**.`,
      });
      return;
    }

    if (selected === "daily") {
      const result = await economy.daily(guildId, ctx.userId);
      await ctx.interaction.reply({
        content: result.ok
          ? `You claimed **${result.amount} ${settings.economy.currency}**. Balance: **${result.balance}**.`
          : `${result.reason} Balance: **${result.balance}**.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "pay") {
      const target = userId(ctx, "user");
      const amount = integer(ctx, "amount");
      if (!target || !amount) throw new UserError("Pay needs a user and an amount.");
      const result = await economy.transfer(
        guildId,
        ctx.userId,
        target,
        amount,
        ctx.interaction.id,
      );
      await ctx.interaction.reply({
        content: result.ok
          ? `Sent **${amount} ${settings.economy.currency}** to <@${target}>.`
          : (result.reason ?? "Transfer failed."),
        ephemeral: true,
      });
      return;
    }

    if (selected === "shop") {
      const items = economy.shop();
      await ctx.interaction.reply({
        embeds: [
          {
            title: `${settings.economy.currency} shop`,
            description:
              items.length === 0
                ? "The shop is empty."
                : items
                    .map(
                      (item) =>
                        `**${item.name}** — ${item.price} (id: \`${item.id}\`)${
                          item.description ? `\n${item.description}` : ""
                        }`,
                    )
                    .join("\n\n"),
            color: 0x57f287,
          },
        ],
      });
      return;
    }

    if (selected === "buy") {
      const itemId = text(ctx, "item");
      if (!itemId) throw new UserError("Name the shop item to buy.");
      const result = await economy.buy(guildId, ctx.userId, itemId, ctx.interaction.id);
      await ctx.interaction.reply({
        content: result.ok
          ? `Bought **${result.item?.name}**. Balance: **${result.balance}**.`
          : (result.reason ?? "Purchase failed."),
        ephemeral: true,
      });
      return;
    }

    if (selected === "gamble") {
      const amount = integer(ctx, "amount");
      if (!amount) throw new UserError("Name the amount to gamble.");
      const result = await economy.gamble(guildId, ctx.userId, amount, ctx.interaction.id);
      await ctx.interaction.reply({
        content: result.ok
          ? result.won
            ? `You won **${result.amount}**. Balance: **${result.balance}**.`
            : `You lost **${amount}**. Balance: **${result.balance}**.`
          : (result.reason ?? "Gamble failed."),
        ephemeral: true,
      });
      return;
    }

    if (selected === "ledger") {
      const rows = await economy.ledger(guildId, ctx.userId, integer(ctx, "limit") ?? 10);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "Your ledger",
            description:
              rows.length === 0
                ? "No movements yet."
                : rows
                    .map(
                      (entry) =>
                        `${entry.amount > 0 ? "+" : ""}${entry.amount} · ${entry.reason} · ${entry.createdAt.slice(0, 10)}`,
                    )
                    .join("\n"),
            color: 0xfaa61a,
          },
        ],
        ephemeral: true,
      });
      return;
    }

    if (selected === "season") {
      requirePermission(ctx, "ManageGuild");
      const key =
        text(ctx, "value") ?? `season-${new Date(ctx.now()).toISOString().slice(0, 10)}`;
      const service = new SeasonService(store, ctx.now);
      const result = await service.start(guildId, key, integer(ctx, "days") ?? 30);
      await ctx.interaction.reply({
        content: result.alreadyReset
          ? `Season **${result.state.key}** was already started; no profiles were archived again.`
          : `Season **${result.state.key}** started. Archived **${result.archived}** profile(s); the XP ledger remains intact.`,
        ephemeral: true,
      });
    }
  },
  notes: "XP is an append-only event projection; the economy ledger is the balance source.",
});
