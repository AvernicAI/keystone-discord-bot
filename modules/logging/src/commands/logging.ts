import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  requirePermissions,
  type CommandContext,
  type LoggingPort,
} from "@keystone/kernel";
import { LOG_EVENTS, LOG_EVENT_CHOICES, logEventMeta } from "../events";
import { loggingStatusEmbed } from "../format";
import { LoggingService } from "../service";
import { eventEnabled, loggingSettingsSchema, setEvent } from "../settings";

function optionText(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionInteger(ctx: CommandContext, key: string): number | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireLogging(ctx: CommandContext): LoggingPort {
  if (!ctx.logging) throw new UserError("Logging is not wired in this process.");
  return ctx.logging;
}

async function statusReply(ctx: CommandContext, port: LoggingPort, note?: string): Promise<void> {
  const service = new LoggingService(port.store, port.actions, ctx.settings, ctx.now);
  const { settings, stored } = await service.status(ctx.guildId as string);
  const toggles = LOG_EVENTS.map(
    (event) => `${event.kind}=${settings.events[event.key] ? "on" : "off"}`,
  ).join(" · ");
  const summary = `Logging ${settings.enabled ? "enabled" : "disabled"} · channel ${
    settings.channelId ? `<#${settings.channelId}>` : "not set"
  } · ${stored} stored · retention ${settings.retentionDays}d.\n${toggles}`;
  await ctx.interaction.reply({
    content: note ? `${note}\n${summary}` : summary,
    ephemeral: true,
    embeds: [loggingStatusEmbed(settings, stored)],
  });
}

export const logging = defineCommand({
  name: "logging",
  description: "Log message, member and moderation events in one audit channel.",
  subcommands: [
    {
      name: "setup",
      description: "Set the log channel, enable logging and send a test message.",
      options: [
        {
          type: "channel",
          name: "channel",
          description: "Channel that receives audit events",
          required: true,
        },
      ],
    },
    {
      name: "channel",
      description: "Change the log channel, or clear it by omitting the option.",
      options: [
        {
          type: "channel",
          name: "channel",
          description: "New audit channel; omit to stop delivery but keep records",
        },
      ],
    },
    {
      name: "events",
      description: "List event toggles, or turn one event type on or off.",
      options: [
        {
          type: "string",
          name: "event",
          description: "Event type to inspect or change",
          choices: LOG_EVENT_CHOICES,
        },
        {
          type: "boolean",
          name: "enabled",
          description: "Turn the selected event on or off",
        },
      ],
    },
    {
      name: "status",
      description: "Show the channel, event toggles, retention and stored count.",
    },
    {
      name: "retention",
      description: "Set how many days to keep events, then prune older rows.",
      options: [
        {
          type: "integer",
          name: "days",
          description: "Retention window in days (1-365)",
          required: true,
          minValue: 1,
          maxValue: 365,
        },
      ],
    },
    {
      name: "export",
      description: "Export the settings and the ten newest events as JSON.",
    },
    {
      name: "disable",
      description: "Stop capturing and delivering events; keep the configuration.",
    },
  ],
  guards: [requireGuild, requirePermissions("ManageGuild"), cooldown(2_000)],
  async execute(ctx: CommandContext): Promise<void> {
    const port = requireLogging(ctx);
    const guildId = ctx.guildId as string;
    const selected = ctx.commandPath[0];
    const current = loggingSettingsSchema.parse(await ctx.settings.get(guildId));
    const service = new LoggingService(port.store, port.actions, ctx.settings, ctx.now);

    if (selected === "setup") {
      const channelId = optionText(ctx, "channel");
      if (!channelId) throw new UserError("Choose a channel with the `channel` option.");
      const test = await service.testChannel(guildId, channelId);
      if (!test.ok) {
        throw new UserError(
          `Could not post in <#${channelId}>: ${test.detail ?? "check the channel permissions"}.`,
        );
      }
      await ctx.settings.update(guildId, { enabled: true, channelId });
      await statusReply(ctx, port, "Logging enabled. A test message was posted to the channel.");
      return;
    }

    if (selected === "channel") {
      const channelId = optionText(ctx, "channel");
      if (channelId) {
        await ctx.settings.update(guildId, { channelId });
        await statusReply(ctx, port, `Log channel set to <#${channelId}>.`);
      } else {
        await ctx.settings.update(guildId, { channelId: null });
        await statusReply(
          ctx,
          port,
          "Log channel cleared. Enabled events are still stored until retention prunes them.",
        );
      }
      return;
    }

    if (selected === "events") {
      const eventName = optionText(ctx, "event");
      if (!eventName) {
        await statusReply(ctx, port);
        return;
      }

      const meta = logEventMeta(eventName);
      if (!meta) throw new UserError(`Unknown event type. Choose ${LOG_EVENT_CHOICES.map((choice) => choice.value).join(", ")}.`);

      const enabled = ctx.interaction.options.enabled;
      if (typeof enabled !== "boolean") {
        await ctx.interaction.reply({
          content: `${meta.label} logging is ${eventEnabled(current, meta.kind) ? "on" : "off"}.`,
          ephemeral: true,
        });
        return;
      }

      await ctx.settings.update(guildId, { events: setEvent(current, meta.kind, enabled).events });
      await statusReply(ctx, port, `${meta.label} logging is now ${enabled ? "on" : "off"}.`);
      return;
    }

    if (selected === "status") {
      await statusReply(ctx, port);
      return;
    }

    if (selected === "retention") {
      const days = optionInteger(ctx, "days");
      if (!days) throw new UserError("Provide a retention window in days.");
      await ctx.settings.update(guildId, { retentionDays: days });
      const pruned = await service.prune(guildId);
      await statusReply(
        ctx,
        port,
        `Retention set to ${days} days. Pruned ${pruned} stored event${pruned === 1 ? "" : "s"}.`,
      );
      return;
    }

    if (selected === "export") {
      const snapshot = await service.snapshot(guildId, 10);
      let events = [...snapshot.events];
      const render = (): string =>
        JSON.stringify({
          ...snapshot,
          events,
          truncated: events.length < snapshot.events.length,
        });
      let json = render();
      while (json.length > 3_850 && events.length > 0) {
        events = events.slice(0, -1);
        json = render();
      }
      if (json.length > 3_850) {
        json = JSON.stringify({ ...snapshot, events: [], truncated: true });
      }
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Logging export: ${snapshot.events.length} stored event(s); JSON is in the embed.`,
        embeds: [
          {
            title: "Logging export",
            description: `\`\`\`json\n${json}\n\`\`\``.slice(0, 4_096),
            color: 0x5865f2,
            footer: { text: "Settings plus the ten newest stored events; no Discord token is included." },
          },
        ],
      });
      return;
    }

    if (selected === "disable") {
      await ctx.settings.update(guildId, { enabled: false });
      await statusReply(ctx, port, "Logging disabled. Existing records remain until retention prunes them.");
      return;
    }

    throw new UserError("Unknown logging action. Use /logging status.");
  },
  help: {
    category: "Operations",
    examples: [
      "/logging setup channel:#mod-logs",
      "/logging events event:message_delete enabled:false",
      "/logging retention days:14",
    ],
  },
  notes:
    "One audit channel per guild. Events are stored first and delivered best-effort, so a broken channel never loses the ledger. Message edit/delete content is retained only for the configured window. Member logs need the GuildMembers intent; message content needs MessageContent.",
});
