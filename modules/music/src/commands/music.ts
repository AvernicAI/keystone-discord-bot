import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
  type MusicPort,
} from "@keystone/kernel";
import { MusicService } from "../music";

const QUERY = {
  type: "string",
  name: "query",
  description: "Audio URL to save; playback is unavailable in this build",
  required: true,
} as const;

const TITLE = {
  type: "string",
  name: "title",
  description: "Optional label for the saved track",
} as const;

const POSITION = {
  type: "integer",
  name: "position",
  description: "1-based position in the saved queue",
  required: true,
  minValue: 1,
  maxValue: 100,
} as const;

function optionText(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionInteger(ctx: CommandContext, key: string): number | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireMusic(ctx: CommandContext): MusicPort {
  if (!ctx.music) throw new UserError("Music is not wired in this process.");
  return ctx.music;
}

function canManage(ctx: CommandContext): boolean {
  const held = new Set(ctx.interaction.permissions);
  return held.has("Administrator") || held.has("ManageGuild");
}

function requireManager(ctx: CommandContext): void {
  if (!canManage(ctx)) throw new UserError("Missing permission: ManageGuild");
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function trackLine(track: { title: string; uri: string; requestedBy: string }, index: number): string {
  return `${index + 1}. **${clip(track.title, 80)}** — ${clip(track.uri, 90)} — <@${track.requestedBy}>`;
}

export const music = defineCommand({
  name: "music",
  description: "Save tracks in a durable queue and inspect playback readiness.",
  subcommands: [
    {
      name: "play",
      description: "Ask the playback backend to play; refuses when none is installed.",
      options: [QUERY],
    },
    {
      name: "queue",
      description: "Show the saved queue and whether audio is actually playing.",
    },
    {
      name: "add",
      description: "Save a track for later; this never plays audio.",
      options: [QUERY, TITLE],
    },
    {
      name: "remove",
      description: "Remove one saved track by position.",
      options: [POSITION],
    },
    {
      name: "clear",
      description: "Clear every saved track. Nothing is left playing.",
    },
    {
      name: "skip",
      description: "Skip the current track; refuses when there is no player.",
    },
    {
      name: "stop",
      description: "Stop playback; refuses when there is no player.",
    },
    {
      name: "status",
      description: "Show module state, queue count and the exact playback blocker.",
    },
  ],
  guards: [requireGuild, cooldown(2_000)],
  async execute(ctx: CommandContext): Promise<void> {
    const port = requireMusic(ctx);
    const guildId = ctx.guildId as string;
    const service = new MusicService(port.store, port.playback, ctx.settings, ctx.now);
    const selected = ctx.commandPath[0];

    if (selected === "status") {
      const status = await service.status(guildId);
      const toggle = status.settings.enabled ? "enabled" : "disabled";
      const enable = status.settings.enabled
        ? ""
        : `\nEnable it with \`/config set module=music key=enabled value=true\`.`;
      await ctx.interaction.reply({
        content: [
          `Music is ${toggle} · saved queue ${status.tracks}/${status.settings.maxTracks} · playback ${status.playback.available ? "available" : "UNAVAILABLE"} (backend ${status.playback.backend}).`,
          status.playback.reason,
          `Queue record: ${status.tracks} saved track(s) under kind \`music_queue\`, key \`default\` (table \`community_records\` in SQL mode; process memory otherwise).`,
          enable,
        ]
          .filter(Boolean)
          .join("\n"),
        ephemeral: true,
      });
      return;
    }

    if (selected === "queue") {
      const { settings, tracks } = await service.list(guildId);
      if (tracks.length === 0) {
        await ctx.interaction.reply({
          content: `Saved queue is empty (0/${settings.maxTracks}). Nothing is playing: playback is unavailable in this build.`,
          ephemeral: true,
        });
        return;
      }
      const visible = tracks.slice(0, 10).map(trackLine);
      const remainder = tracks.length > visible.length ? `\n…and ${tracks.length - visible.length} more saved track(s).` : "";
      await ctx.interaction.reply({
        content: [
          `Saved queue · ${tracks.length}/${settings.maxTracks} · nothing is playing`,
          ...visible,
          remainder,
          "These rows are saved only; no audio is played in this build.",
        ].join("\n"),
        ephemeral: true,
      });
      return;
    }

    if (selected === "add") {
      const query = optionText(ctx, "query");
      if (!query) throw new UserError("Provide an audio URL to save.");
      const title = optionText(ctx, "title");
      const { settings, result } = await service.add(guildId, ctx.userId, query, title);
      const position = result.queue.tracks.length;
      const saved = result.queue.tracks.at(-1);
      await ctx.interaction.reply({
        content: `Saved **${saved?.title ?? "track"}** at position ${position}/${settings.maxTracks}. Nothing is playing: playback is unavailable in this build.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "remove") {
      requireManager(ctx);
      const position = optionInteger(ctx, "position");
      if (!position) throw new UserError("Provide a 1-based queue position.");
      const result = await service.remove(guildId, position);
      await ctx.interaction.reply({
        content: `Removed **${result.removed?.title ?? "track"}**. ${result.queue.tracks.length} saved track(s) remain; nothing is playing.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "clear") {
      requireManager(ctx);
      const result = await service.clear(guildId);
      await ctx.interaction.reply({
        content: `Cleared ${result.removed} saved track(s). Nothing was playing, and nothing is playing now.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "play") {
      const query = optionText(ctx, "query");
      if (!query) throw new UserError("Provide an audio URL to play.");
      const result = await service.play(guildId, ctx.userId, query);
      await ctx.interaction.reply({
        content: result.ok
          ? `Playback requested for ${clip(query, 120)}.`
          : `Playback refused. ${result.detail ?? "No backend is available."}`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "skip") {
      await service.skip(guildId);
      await ctx.interaction.reply({ content: "Skipped the current track.", ephemeral: true });
      return;
    }

    if (selected === "stop") {
      await service.stop(guildId);
      await ctx.interaction.reply({ content: "Playback stopped.", ephemeral: true });
      return;
    }

    throw new UserError("Unknown music action. Use `/music status`.");
  },
  help: {
    category: "Music",
    examples: [
      "/music status",
      "/music add query:https://example.com/tone.mp3 title:Test_tone",
      "/music queue",
    ],
  },
  notes:
    "The saved queue is real and persists in community_records. Playback is a separate port; this build has no voice or Lavalink client, so play, skip and stop refuse with the exact missing backend instead of pretending audio is playing.",
});
