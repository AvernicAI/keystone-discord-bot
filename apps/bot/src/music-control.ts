import {
  type Logger,
  type ModuleSettings,
  type MusicControlBus,
  type MusicControlReply,
  type MusicControlRequest,
  type MusicControlState,
  type MusicLoopMode,
  type MusicPlayback,
  type MusicStore,
} from "@keystone/kernel";
import { MUSIC_DISABLED_MESSAGE, musicSettingsSchema } from "@keystone/module-music";

export interface MusicControlDeps {
  readonly playback: MusicPlayback;
  readonly store: MusicStore;
  readonly settings: ModuleSettings;
  readonly logger: Logger;
}

function message(result: { ok: boolean; detail?: string }, fallback: string): MusicControlReply {
  return result.ok
    ? { ok: true, message: result.detail ?? fallback }
    : { ok: false, code: "refused", message: result.detail ?? fallback };
}

/**
 * One request from the dashboard. The web process has already checked that the
 * caller manages the guild; this handler is the bot's policy layer, so it still
 * reads the module's own enabled flag and never trusts an action it does not
 * know. It returns a message safe to show in a browser.
 */
export function createMusicControlHandler(
  deps: MusicControlDeps,
): (request: MusicControlRequest) => Promise<MusicControlReply> {
  return async (request) => {
    if (!/^\d{15,20}$/.test(request.guildId)) {
      return { ok: false, code: "guild_invalid", message: "That guild id is invalid." };
    }
    const settings = musicSettingsSchema.parse(await deps.settings.get(request.guildId));
    if (!settings.enabled) {
      return { ok: false, code: "disabled", message: MUSIC_DISABLED_MESSAGE };
    }

    try {
      switch (request.action) {
        case "play": {
          const query = typeof request.query === "string" ? request.query.trim() : "";
          if (!query) {
            return { ok: false, code: "query_missing", message: "Enter an http(s) audio URL." };
          }
          if (!request.voiceChannelId) {
            return {
              ok: false,
              code: "voice_missing",
              message: "Choose the voice channel the bot should join.",
            };
          }
          const played = await deps.playback.play({
            guildId: request.guildId,
            userId: request.actorId,
            query,
            voiceChannelId: request.voiceChannelId,
            ...(request.textChannelId ? { textChannelId: request.textChannelId } : {}),
            maxTracks: settings.maxTracks,
            volume: settings.defaultVolume,
          });
          if (played.ok && played.playing === false && played.position) {
            // Adding while a session is live appends; it does not start
            // anything, so "Started playback." would be a false report.
            return { ok: true, message: `Queued at position ${played.position}.` };
          }
          return message(played, "Started playback.");
        }
        case "resume": {
          const snapshot = await deps.playback.snapshot(request.guildId);
          const voiceChannelId = request.voiceChannelId ?? snapshot?.voiceChannelId ?? "";
          if (!voiceChannelId) {
            return {
              ok: false,
              code: "voice_missing",
              message: "Choose a voice channel before resuming.",
            };
          }
          return message(
            await deps.playback.resume({
              guildId: request.guildId,
              userId: request.actorId,
              voiceChannelId,
              ...(request.textChannelId ? { textChannelId: request.textChannelId } : {}),
              volume: settings.defaultVolume,
            }),
            "Resumed the queue.",
          );
        }
        case "pause":
          return message(
            await deps.playback.pause(request.guildId, request.value !== "false"),
            "Paused.",
          );
        case "skip":
          return message(await deps.playback.skip(request.guildId), "Skipped.");
        case "stop":
          return message(await deps.playback.stop(request.guildId), "Stopped.");
        case "shuffle":
          return message(await deps.playback.shuffle(request.guildId), "Shuffled.");
        case "loop": {
          const mode = String(request.value ?? "");
          if (mode !== "off" && mode !== "track" && mode !== "queue") {
            return { ok: false, code: "loop_invalid", message: "Loop must be off, track or queue." };
          }
          return message(
            await deps.playback.setLoop(request.guildId, mode as MusicLoopMode),
            `Loop is ${mode}.`,
          );
        }
        case "volume": {
          const value = Number(request.value);
          if (!Number.isFinite(value) || value < 0 || value > 200) {
            return { ok: false, code: "volume_invalid", message: "Volume must be 0 to 200." };
          }
          return message(
            await deps.playback.setVolume(request.guildId, Math.round(value)),
            "Volume changed.",
          );
        }
        case "remove": {
          const position = Number(request.value);
          if (!Number.isInteger(position) || position < 1) {
            return { ok: false, code: "position_invalid", message: "Choose a queue position." };
          }
          return message(
            await deps.playback.remove(request.guildId, position),
            "Removed that track.",
          );
        }
        default:
          return {
            ok: false,
            code: "action_unknown",
            message: "That music control is not supported.",
          };
      }
    } catch (error) {
      deps.logger.warn("music dashboard control failed", {
        guildId: request.guildId,
        action: request.action,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        code: "control_failed",
        message: error instanceof Error ? error.message : "The bot could not run that control.",
      };
    }
  };
}

/** Publish the player and queue the dashboard reads; never a guessed state. */
export async function publishMusicState(
  deps: MusicControlDeps,
  bus: MusicControlBus,
  guildId: string,
): Promise<void> {
  const snapshot = await deps.playback.snapshot(guildId);
  if (!snapshot) return;
  const [status, queue] = await Promise.all([
    deps.playback.status(),
    deps.store.list(guildId),
  ]);
  const state: MusicControlState = {
    guildId,
    reportedAt: new Date().toISOString(),
    node: status.node ?? {
      name: "none",
      available: false,
      ...(status.reason ? { detail: status.reason } : {}),
    },
    player: snapshot,
    queue,
  };
  await bus.publishState(state);
}

export interface MusicReporter {
  stop(): void;
}

/**
 * The bot is the only process that can see the player, so it publishes state
 * for live sessions. Five seconds is a dashboard refresh, not an audio clock:
 * the position is the node's last report and may be a few seconds old.
 */
export function startMusicStateReporter(options: {
  bus: MusicControlBus;
  deps: MusicControlDeps;
  intervalMs?: number;
}): MusicReporter {
  let stopped = false;
  let lastActive = new Set<string>();
  const publish = async (): Promise<void> => {
    if (stopped) return;
    await options.bus.publishHeartbeat(new Date().toISOString()).catch(() => undefined);
    const guilds = options.deps.playback.activeGuilds?.() ?? [];
    const active = new Set<string>();
    for (const guildId of guilds) {
      try {
        await publishMusicState(options.deps, options.bus, guildId);
        active.add(guildId);
      } catch (error) {
        options.deps.logger.warn("music state publish failed", {
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // A session that just went idle is no longer active, so the page would
    // otherwise show its last "playing" snapshot until the 90s TTL. Publish
    // the idle state once, then stop reporting it.
    for (const guildId of lastActive) {
      if (active.has(guildId)) continue;
      try {
        await publishMusicState(options.deps, options.bus, guildId);
      } catch (error) {
        options.deps.logger.warn("music final state publish failed", {
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    lastActive = active;
  };
  void publish();
  const timer = setInterval(() => void publish(), options.intervalMs ?? 5_000);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
