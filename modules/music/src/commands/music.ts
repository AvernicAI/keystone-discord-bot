import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
  type CommandOption,
  type MusicLoopMode,
  type MusicPort,
} from "@keystone/kernel";
import { DJ_REFUSAL, MusicService, isDj } from "../music";
import { formatDuration } from "../panel";
import type { MusicSettings } from "../settings";

const PLAY_QUERY = {
  type: "string",
  name: "query",
  description: "http(s) audio URL; leave empty to resume the saved queue",
} as const;

const ADD_QUERY = {
  type: "string",
  name: "query",
  description: "http(s) audio URL to save without playing",
  required: true,
} as const;

const TITLE = {
  type: "string",
  name: "title",
  description: "Optional label for the saved track",
} as const;

const NEXT = {
  type: "boolean",
  name: "next",
  description: "Queue this track directly after the current one",
} as const;

const POSITION = {
  type: "integer",
  name: "position",
  description: "1-based position; 1 is the current track",
  required: true,
  minValue: 1,
  maxValue: 500,
} as const;

const VOLUME = {
  type: "integer",
  name: "percent",
  description: "Volume from 0 to 200",
  required: true,
  minValue: 0,
  maxValue: 200,
} as const;

const LOOP: CommandOption = {
  type: "string",
  name: "mode",
  description: "What should repeat when the track ends",
  required: true,
  choices: [
    { name: "Off", value: "off" },
    { name: "Repeat the current track", value: "track" },
    { name: "Repeat the whole queue", value: "queue" },
  ],
};

function optionText(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionInteger(ctx: CommandContext, key: string): number | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionBoolean(ctx: CommandContext, key: string): boolean {
  return ctx.interaction.options[key] === true;
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

/**
 * The DJ gate runs in the command layer because the settings and the caller's
 * roles meet here. The player stays policy-free; it only enforces audio rules.
 */
function requireDj(ctx: CommandContext, settings: MusicSettings): void {
  if (
    !isDj(settings, {
      permissions: ctx.interaction.permissions,
      ...(ctx.interaction.roleIds ? { roleIds: ctx.interaction.roleIds } : {}),
    })
  ) {
    throw new UserError(DJ_REFUSAL);
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function trackLine(
  track: { title: string; uri: string; requestedBy: string; durationMs?: number },
  index: number,
): string {
  const length = formatDuration(track.durationMs);
  return `${index + 1}. **${clip(track.title, 80)}**${length ? ` · ${length}` : ""} — ${clip(track.uri, 90)} — <@${track.requestedBy}>`;
}

function loopLabel(mode: MusicLoopMode): string {
  return mode === "track" ? "the current track" : mode === "queue" ? "the queue" : "off";
}

export const music = defineCommand({
  name: "music",
  description: "Play, queue and control audio through a real Lavalink player.",
  subcommands: [
    {
      name: "play",
      description: "Join your voice channel and play a URL, or resume the saved queue.",
      options: [PLAY_QUERY, NEXT],
    },
    {
      name: "resume",
      description: "Resume the saved queue or unpause the current track.",
    },
    {
      name: "pause",
      description: "Pause the current track and keep the queue.",
    },
    {
      name: "skip",
      description: "Skip the current track and play the next one.",
    },
    {
      name: "stop",
      description: "Stop playback, empty the queue and leave the voice channel.",
    },
    { name: "queue", description: "Show the current track, the next tracks and the loop state." },
    {
      name: "add",
      description: "Save a URL at the end of the play queue without starting audio.",
      options: [ADD_QUERY, TITLE],
    },
    {
      name: "remove",
      description: "Remove one track by position; removing 1 skips it.",
      options: [POSITION],
    },
    {
      name: "clear",
      description: "Stop playback and empty the queue but stay in voice.",
    },
    {
      name: "volume",
      description: "Set the player volume from 0 to 200 percent.",
      options: [VOLUME],
    },
    {
      name: "loop",
      description: "Repeat off, one track or the whole queue.",
      options: [LOOP],
    },
    {
      name: "shuffle",
      description: "Shuffle the upcoming tracks and keep the current one at the head.",
    },
    {
      name: "jump",
      description: "Jump to a position in the queue and drop the tracks before it.",
      options: [POSITION],
    },
    {
      name: "status",
      description: "Show node identity, latency, players and the exact playback state.",
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
      const node = status.playback.node;
      const toggle = status.settings.enabled ? "enabled" : "disabled";
      const enable = status.settings.enabled
        ? ""
        : `\nEnable it with \`/config set module=music key=enabled value=true\`.`;
      const nodeLine = node
        ? `Node ${node.name} · ${node.available ? "connected" : "not connected"}${node.version ? ` · Lavalink ${node.version}` : ""}${node.players === undefined ? "" : ` · ${node.playingPlayers ?? 0}/${node.players} players active`}${node.pingMs === undefined ? "" : ` · ${node.pingMs}ms`}`
        : "No node is configured in this process.";
      const player = status.player;
      const playerLine = player
        ? `Player: ${player.state}${player.track ? ` · ${clip(player.track.title, 80)}` : ""} · ${player.queueCount} queued · volume ${player.volume}% · loop ${player.loop}`
        : "No player has been started in this server yet.";
      await ctx.interaction.reply({
        content: [
          `Music is ${toggle} · queue ${status.tracks}/${status.settings.maxTracks} · playback ${status.playback.available ? "available" : "UNAVAILABLE"} (backend ${status.playback.backend}).`,
          nodeLine,
          playerLine,
          status.playback.reason,
          `DJ only: ${status.settings.djOnly ? "yes" : "no"} · default volume ${status.settings.defaultVolume}% · idle leave ${status.settings.idleLeaveSeconds}s.`,
          `Queue record: ${status.tracks} track(s) under kind \`music_queue\`, key \`default\` (table \`community_records\` in SQL mode; process memory otherwise).`,
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
      const player = await service.snapshot(guildId);
      if (tracks.length === 0) {
        await ctx.interaction.reply({
          content: `The play queue is empty (0/${settings.maxTracks}). ${player?.state === "idle" || !player ? "Nothing is playing." : "A player is connected but has nothing queued."}`,
          ephemeral: true,
        });
        return;
      }
      const visible = tracks.slice(0, 10).map(trackLine);
      const remainder =
        tracks.length > visible.length ? `\n…and ${tracks.length - visible.length} more.` : "";
      await ctx.interaction.reply({
        content: [
          `Play queue · ${tracks.length}/${settings.maxTracks} · ${player ? `${player.state} at ${formatDuration(player.positionMs) ?? "0:00"}` : "no player"} · loop ${player?.loop ?? "off"} · volume ${player?.volume ?? settings.defaultVolume}%`,
          ...visible,
          remainder,
          "The head is the current track. `/music jump` skips ahead; `/music remove` deletes one row.",
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
        content: `Saved **${saved?.title ?? "track"}** at position ${position}/${settings.maxTracks}. Use \`/music play\` with no query to start the queue.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "volume") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const percent = optionInteger(ctx, "percent");
      if (percent === undefined) throw new UserError("Provide a volume from 0 to 200.");
      const result = await service.setVolume(guildId, percent);
      await ctx.interaction.reply({ content: result.detail ?? `Volume is ${percent}%.`, ephemeral: true });
      return;
    }

    if (selected === "loop") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const mode = optionText(ctx, "mode") as MusicLoopMode | undefined;
      if (mode !== "off" && mode !== "track" && mode !== "queue") {
        throw new UserError("Choose off, track or queue.");
      }
      await service.setLoop(guildId, mode);
      await ctx.interaction.reply({ content: `Loop is ${loopLabel(mode)}.`, ephemeral: true });
      return;
    }

    if (selected === "shuffle") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const result = await service.shuffle(guildId);
      await ctx.interaction.reply({ content: result.detail ?? "Shuffled.", ephemeral: true });
      return;
    }

    if (selected === "jump") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const position = optionInteger(ctx, "position");
      if (!position) throw new UserError("Provide a 1-based queue position.");
      const result = await service.jump(guildId, position);
      await ctx.interaction.reply({
        content: result.track ? `Jumped to **${clip(result.track.title, 90)}**.` : (result.detail ?? "Jumped."),
        ephemeral: true,
      });
      return;
    }

    if (selected === "remove") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const position = optionInteger(ctx, "position");
      if (!position) throw new UserError("Provide a 1-based queue position.");
      const result = await service.remove(guildId, position);
      await ctx.interaction.reply({
        content: `Removed **${result.removed?.title ?? "track"}**. ${result.queue.tracks.length} track(s) remain.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "clear") {
      requireManager(ctx);
      const result = await service.clear(guildId);
      await ctx.interaction.reply({
        content: `Cleared ${result.removed} track(s) and stopped playback. I stay in voice until the idle timer or \`/music stop\`.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "play" || selected === "resume") {
      const query = selected === "resume" ? undefined : optionText(ctx, "query");
      const result = await service.play({
        guildId,
        userId: ctx.userId,
        ...(query ? { query } : {}),
        voiceChannelId: ctx.interaction.voiceChannelId ?? "",
        ...(ctx.interaction.channelId ? { textChannelId: ctx.interaction.channelId } : {}),
        ...(ctx.interaction.options.next === true ? { next: true } : {}),
      });
      const title = result.track?.title ?? "the queue";
      await ctx.interaction.reply({
        content: result.playing
          ? `▶ Playing **${clip(title, 90)}**. The player card is in this channel.`
          : `Queued **${clip(title, 90)}** at position ${result.position ?? "?"}.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "pause") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      await service.pause(guildId, true);
      await ctx.interaction.reply({ content: "Paused. Use `/music resume` or the card's Resume button.", ephemeral: true });
      return;
    }

    if (selected === "skip") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      const result = await service.skip(guildId);
      await ctx.interaction.reply({
        content: result.track ? `Skipped to **${clip(result.track.title, 90)}**.` : "Skipped; the queue is empty.",
        ephemeral: true,
      });
      return;
    }

    if (selected === "stop") {
      const settings = (await service.list(guildId)).settings;
      requireDj(ctx, settings);
      await service.stop(guildId);
      await ctx.interaction.reply({ content: "Stopped, emptied the queue and left voice.", ephemeral: true });
      return;
    }

    throw new UserError("Unknown music action. Use `/music status`.");
  },
  help: {
    category: "Music",
    examples: [
      "/music play query:https://example.com/tone.mp3",
      "/music queue",
      "/music loop mode:queue",
      "/music status",
    ],
  },
  notes:
    "Playback runs through one Lavalink node behind MusicPlayback; the durable queue is the play queue with the current track at its head. Without LAVALINK_URL and LAVALINK_PASSWORD, every audio operation refuses with the exact missing backend; `/music add` and `/music queue` still work on the saved rows.",
});
