import { defineCommand, UserError, type CommandContext } from "@keystone/kernel";
import { TicketService } from "../tickets";
import { channelId, integer, port, requirePermission, settingsFor, text, userId } from "./helpers";

export const ticket = defineCommand({
  name: "ticket",
  description: "Open, claim, close and analyse private support threads.",
  options: [
    {
      type: "string",
      name: "action",
      description: "What to do",
      required: true,
      choices: ["panel", "open", "claim", "close", "add", "transcript", "summary", "stats"].map((value) => ({
        name: value,
        value,
      })),
    },
    { type: "string", name: "subject", description: "Ticket subject" },
    { type: "user", name: "user", description: "Member to add" },
    { type: "channel", name: "channel", description: "Panel or parent channel" },
    { type: "string", name: "ticket", description: "Ticket id (defaults to this thread)" },
    { type: "string", name: "title", description: "Panel title" },
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
    const service = new TicketService(store, actions, settings, ctx.now);
    const guildId = ctx.guildId as string;
    const selected = text(ctx, "action");

    if (selected === "panel") {
      requirePermission(ctx, "ManageGuild");
      const parent = channelId(ctx, "channel");
      if (!parent) throw new UserError("Choose a channel for the panel.");
      const result = await service.panel(guildId, parent, text(ctx, "title"));
      await ctx.interaction.reply({ content: `Ticket panel posted (${result.messageId}).`, ephemeral: true });
      return;
    }

    if (selected === "open") {
      const parent = ctx.interaction.channelId;
      if (!parent) throw new UserError("Open a ticket from a normal channel, not a DM.");
      const record = await service.open(
        guildId,
        ctx.userId,
        parent,
        text(ctx, "subject") ?? "Support request",
      );
      await ctx.interaction.reply({
        content: `Ticket opened in <#${record.channelId}>.`,
        ephemeral: true,
      });
      return;
    }

    const found = (await store.listTickets(guildId, { limit: 100 })).find(
      (entry) => entry.channelId === ctx.interaction.channelId,
    );
    const ticketId = text(ctx, "ticket") ?? found?.id;
    if (!ticketId) throw new UserError("Use this inside a ticket thread or pass a ticket id.");

    if (selected === "claim") {
      const record = await service.claim(guildId, ticketId, ctx.userId);
      await ctx.interaction.reply({ content: `Claimed ticket ${record.id}.`, ephemeral: true });
      return;
    }

    if (selected === "close") {
      const current = await store.getTicket(guildId, ticketId);
      if (!current) throw new UserError("That ticket does not exist.");
      const support =
        current.openerId === ctx.userId ||
        ctx.interaction.permissions.includes("ManageChannels");
      if (!support) throw new UserError("Only the opener or a support member can close this ticket.");
      const record = await service.close(guildId, ticketId, ctx.userId);
      await ctx.interaction.reply({ content: `Closed ticket ${record.id}.`, ephemeral: true });
      return;
    }

    if (selected === "add") {
      const target = userId(ctx, "user");
      if (!target) throw new UserError("Choose a member to add.");
      await service.addParticipant(guildId, ticketId, ctx.userId, target);
      await ctx.interaction.reply({ content: `Added <@${target}>.`, ephemeral: true });
      return;
    }

    if (selected === "transcript") {
      requirePermission(ctx, "ManageGuild");
      const result = await service.transcript(guildId, ticketId);
      await ctx.interaction.reply({
        content: `\`\`\`\n${result.text.slice(0, 1_900)}\n\`\`\``,
        ephemeral: true,
      });
      return;
    }

    if (selected === "summary") {
      requirePermission(ctx, "ManageGuild");
      if (!ctx.ai) throw new UserError("AI services are not wired.");
      const result = await service.transcript(guildId, ticketId);
      const summary = await ctx.ai.summarize(guildId, result.text);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "Ticket summary",
            description: `${summary.text.slice(0, 3_500)}\n\nAI can be wrong. A human decides any action.`,
            color: 0x5865f2,
            footer: { text: `model ${summary.model}` },
          },
        ],
        ephemeral: true,
      });
      return;
    }

    if (selected === "stats") {
      requirePermission(ctx, "ManageGuild");
      const stats = await service.stats(guildId);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "Ticket statistics",
            description: `Open **${stats.open}** · Claimed **${stats.claimed}** · Closed **${stats.closed}**\nAverage close: **${stats.averageCloseMinutes ?? "n/a"} minutes**`,
            color: 0x5865f2,
          },
        ],
        ephemeral: true,
      });
    }
  },
  notes: "Threads avoid the 50-channel cap; transcripts are records, not exported files.",
});

