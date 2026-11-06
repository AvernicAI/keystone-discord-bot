import type { Client } from "discord.js";
import { Connectors, Constants, Shoukaku, type Player, type Track } from "shoukaku";
import type { Logger, MusicNodeStatus } from "@keystone/kernel";
import type {
  VoiceEndReason,
  VoiceJoinInput,
  VoiceNode,
  VoicePlayer,
  VoiceResolveResult,
  VoiceTrack,
} from "./voice";

export interface ShoukakuNodeOptions {
  readonly client: Client;
  /** `host:port`, or an http(s) URL; the prefix is stripped here. */
  readonly url: string;
  readonly password: string;
  readonly name?: string;
  readonly secure?: boolean;
  readonly logger: Logger;
}

/** Lavalink's node option wants a bare host, never a REST URL. */
export function lavalinkAddress(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function info(track: Track): VoiceTrack {
  return {
    encoded: track.encoded,
    info: {
      identifier: track.info.identifier,
      title: track.info.title,
      ...(track.info.author ? { author: track.info.author } : {}),
      ...(track.info.length > 0 ? { length: track.info.length } : {}),
      ...(track.info.uri ? { uri: track.info.uri } : {}),
      ...(track.info.artworkUrl ? { artworkUrl: track.info.artworkUrl } : {}),
      ...(track.info.isStream ? { isStream: true } : {}),
      ...(track.info.sourceName ? { sourceName: track.info.sourceName } : {}),
    },
  };
}

const END_REASON: Record<string, VoiceEndReason> = {
  finished: "FINISHED",
  loadFailed: "LOAD_FAILED",
  stopped: "STOPPED",
  replaced: "REPLACED",
  cleanup: "CLEANUP",
};

/**
 * The one production `VoiceNode`. Shoukaku is a thin Lavalink connector: it
 * owns the node websocket, the Discord voice handshake and DAVE, and this file
 * only adapts its events to the small `VoiceNode` port the player understands.
 *
 * Defaults that matter, and why they are not Shoukaku's:
 * - `resume: true` and a 60s timeout survive a bot gateway reconnect without
 *   interrupting audio; Shoukaku defaults to no resume.
 * - ten reconnect tries beat the default three when a local node restarts.
 * - `moveOnDisconnect` keeps a player alive when a second node exists.
 */
export class ShoukakuNode implements VoiceNode {
  readonly #manager: Shoukaku;
  readonly #client: Client;
  readonly #name: string;
  readonly #logger: Logger;

  constructor(options: ShoukakuNodeOptions) {
    this.#client = options.client;
    this.#name = options.name ?? "main";
    this.#logger = options.logger;
    this.#manager = new Shoukaku(
      new Connectors.DiscordJS(options.client),
      [
        {
          name: this.#name,
          url: lavalinkAddress(options.url),
          auth: options.password,
          secure: options.secure ?? false,
        },
      ],
      {
        resume: true,
        resumeTimeout: 60,
        resumeByLibrary: true,
        reconnectTries: 10,
        reconnectInterval: 5_000,
        restTimeout: 10_000,
        moveOnDisconnect: true,
        voiceConnectionTimeout: 15_000,
        userAgent: "Keystone/0.1 (self-hosted)",
      },
    );

    this.#manager.on("error", (name, error) => {
      this.#logger.warn("lavalink node error", { node: name, error: error.message });
    });
    this.#manager.on("reconnecting", (name, left) => {
      this.#logger.warn("lavalink node reconnecting", { node: name, triesLeft: left });
    });
    this.#manager.on("ready", (name) => {
      this.#logger.info("lavalink node ready", { node: name });
    });
    this.#manager.on("close", (name, code, reason) => {
      this.#logger.warn("lavalink node closed", { node: name, code, reason });
    });
  }

  async status(): Promise<MusicNodeStatus> {
    const node = this.#manager.nodes.get(this.#name);
    if (!node) {
      return {
        name: this.#name,
        available: false,
        detail: "The configured Lavalink node has not been created yet.",
      };
    }
    const available = node.state === Constants.State.CONNECTED;
    let stats = node.stats ?? undefined;
    if (!stats && available) {
      stats = await node.rest.stats().catch(() => undefined);
    }
    const ping = [...this.#manager.players.values()]
      .map((player) => player.ping)
      .filter((value) => Number.isFinite(value) && value >= 0);
    return {
      name: node.name,
      available,
      ...(node.info?.version.semver ? { version: node.info.version.semver } : {}),
      ...(stats ? { players: stats.players, playingPlayers: stats.playingPlayers } : {}),
      ...(ping.length > 0
        ? { pingMs: Math.round(ping.reduce((sum, value) => sum + value, 0) / ping.length) }
        : {}),
      ...(available
        ? {}
        : {
            detail: `Lavalink node "${node.name}" has not connected. Check LAVALINK_URL, LAVALINK_PASSWORD and that the lavalink service is running.`,
          }),
    };
  }

  async resolve(query: string): Promise<VoiceResolveResult> {
    const node = this.#manager.getIdealNode();
    if (!node || node.state !== Constants.State.CONNECTED) {
      return {
        ok: false,
        detail: "The Lavalink node is not connected, so nothing can be resolved.",
      };
    }
    try {
      const result = await node.rest.resolve(query);
      if (!result) return { ok: false, detail: "Lavalink returned no response." };
      if (result.loadType === "track") return { ok: true, track: info(result.data) };
      if (result.loadType === "search" && result.data.length > 0) {
        return { ok: true, track: info(result.data[0] as Track) };
      }
      if (result.loadType === "playlist" && result.data.tracks.length > 0) {
        return { ok: true, track: info(result.data.tracks[0] as Track) };
      }
      if (result.loadType === "error") {
        return {
          ok: false,
          detail: `Lavalink could not load that track: ${result.data.message}`,
        };
      }
      return {
        ok: false,
        detail:
          "Lavalink loaded nothing. Use an http(s) audio URL; search needs a source plugin on the node.",
      };
    } catch (error) {
      return {
        ok: false,
        detail: `Lavalink did not answer the resolve request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async join(input: VoiceJoinInput): Promise<VoicePlayer> {
    const guild = this.#client.guilds.cache.get(input.guildId);
    const player = await this.#manager.joinVoiceChannel({
      guildId: input.guildId,
      channelId: input.voiceChannelId,
      shardId: guild?.shardId ?? 0,
      deaf: input.deaf ?? true,
    });
    return wrapPlayer(player);
  }

  async leave(guildId: string): Promise<void> {
    await this.#manager.leaveVoiceChannel(guildId);
  }

  async close(): Promise<void> {
    for (const node of this.#manager.nodes.values()) {
      node.disconnect(1000, "Keystone shutting down");
    }
  }
}

/** One thin wrapper: Shoukaku's Player outside, the port the queue knows inside. */
function wrapPlayer(player: Player): VoicePlayer {
  return {
    get paused() {
      return player.paused;
    },
    get position() {
      return player.position;
    },
    async play(encoded: string) {
      await player.playTrack({ track: { encoded } });
    },
    async pause(paused: boolean) {
      await player.setPaused(paused);
    },
    async stop() {
      await player.stopTrack();
    },
    async setVolume(volume: number) {
      await player.setGlobalVolume(volume);
    },
    async destroy() {
      await player.destroy();
    },
    onStart(handler) {
      player.on("start", () => handler());
    },
    onEnd(handler) {
      player.on("end", (event) => handler(END_REASON[event.reason] ?? "UNKNOWN"));
    },
    onException(handler) {
      player.on("exception", (event) => handler(event.exception.message));
    },
    onStuck(handler) {
      player.on("stuck", () => handler());
    },
    onClosed(handler) {
      player.on("closed", (event) => handler(`${event.code}: ${event.reason}`));
    },
  };
}
