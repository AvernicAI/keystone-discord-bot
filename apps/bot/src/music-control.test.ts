import { describe, expect, it } from "vitest";
import {
  createSilentLogger,
  type MusicPlayback,
  type MusicPlaybackResult,
  type MusicPlayerSnapshot,
} from "@keystone/kernel";
import { InMemoryMusicControlBus } from "@keystone/cache";
import {
  MUSIC_DISABLED_MESSAGE,
  InMemoryMusicStore,
  musicDefaultSettings,
  musicSettingsSchema,
  parseTrack,
} from "@keystone/module-music";
import {
  createMusicControlHandler,
  publishMusicState,
  startMusicStateReporter,
} from "./music-control";

const GUILD = "1450130465146142785";
const TEXT = "1450130465146142786";

function snapshot(): MusicPlayerSnapshot {
  return {
    guildId: GUILD,
    voiceChannelId: "1450130465146142787",
    textChannelId: TEXT,
    state: "playing",
    track: {
      id: "track-1",
      title: "Tone",
      uri: "https://example.com/tone.mp3",
      requestedBy: "user-1",
      addedAt: "2026-11-05T21:00:00.000Z",
    },
    positionMs: 12_000,
    volume: 80,
    loop: "off",
    queueCount: 1,
    updatedAt: "2026-11-05T21:00:00.000Z",
  };
}

class FakePlayback implements MusicPlayback {
  readonly calls: string[] = [];
  current: MusicPlayerSnapshot | undefined = snapshot();
  active: readonly string[] = [GUILD];

  async status() {
    return {
      available: true,
      backend: "lavalink",
      configured: true,
      reason: "Lavalink node main is connected.",
      missing: [],
      node: { name: "main", available: true, version: "4.2.2", players: 1 },
    };
  }
  async play(input: { query: string; voiceChannelId: string }): Promise<MusicPlaybackResult> {
    this.calls.push(`play:${input.voiceChannelId}:${input.query}`);
    return { ok: true, detail: "Started playback.", track: snapshot().track };
  }
  async resume(input: { voiceChannelId: string }) {
    this.calls.push(`resume:${input.voiceChannelId}`);
    return { ok: true, detail: "Resumed the queue." };
  }
  async enqueue() {
    return { ok: true };
  }
  async pause(_guildId: string, paused: boolean) {
    this.calls.push(`pause:${paused}`);
    return { ok: true, detail: paused ? "Paused." : "Resumed." };
  }
  async skip() {
    this.calls.push("skip");
    return { ok: true, detail: "Skipped." };
  }
  async stop() {
    this.calls.push("stop");
    return { ok: true, detail: "Stopped." };
  }
  async setVolume(_guildId: string, volume: number) {
    this.calls.push(`volume:${volume}`);
    return { ok: true, detail: `Volume is ${volume}%.` };
  }
  async setLoop(_guildId: string, mode: string) {
    this.calls.push(`loop:${mode}`);
    return { ok: true, detail: `Loop is ${mode}.` };
  }
  async shuffle() {
    return { ok: true, detail: "Shuffled." };
  }
  async jump() {
    return { ok: true };
  }
  async remove(_guildId: string, position: number) {
    this.calls.push(`remove:${position}`);
    return { ok: true, detail: "Removed that track." };
  }
  async clear() {
    return { ok: true };
  }
  async snapshot() {
    return this.current;
  }
  async show() {
    return { ok: true };
  }
  activeGuilds() {
    return this.active;
  }
}

function deps(enabled = true, playback = new FakePlayback()) {
  const values = musicSettingsSchema.parse({ ...musicDefaultSettings, enabled });
  const settings = {
    async get() {
      return values;
    },
    async update() {
      throw new Error("controls must never write settings");
    },
  };
  return {
    playback,
    store: new InMemoryMusicStore(),
    settings,
    logger: createSilentLogger(),
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    guildId: GUILD,
    actorId: "user-1",
    source: "web" as const,
    action: "skip" as const,
    requestedAt: "2026-11-05T21:00:00.000Z",
    ...overrides,
  };
}

describe("music control handler", () => {
  it("refuses an invalid guild id before touching settings or audio", async () => {
    const handler = createMusicControlHandler(deps());
    const reply = await handler(request({ guildId: "not-a-guild" }));
    expect(reply).toMatchObject({ ok: false, code: "guild_invalid" });
  });

  it("refuses every action while the module is disabled", async () => {
    const handler = createMusicControlHandler(deps(false));
    const reply = await handler(request());
    expect(reply).toMatchObject({ ok: false, code: "disabled", message: MUSIC_DISABLED_MESSAGE });
  });

  it("requires a URL and a voice channel to start playback", async () => {
    const handler = createMusicControlHandler(deps());
    expect(await handler(request({ action: "play", voiceChannelId: "v" }))).toMatchObject({
      code: "query_missing",
    });
    expect(
      await handler(request({ action: "play", query: "https://example.com/a.mp3" })),
    ).toMatchObject({ code: "voice_missing" });
  });

  it("passes a play request to the same playback port the commands use", async () => {
    const base = deps();
    const handler = createMusicControlHandler(base);
    const reply = await handler(
      request({
        action: "play",
        query: "https://example.com/a.mp3",
        voiceChannelId: "voice-1",
        textChannelId: TEXT,
      }),
    );
    expect(reply).toMatchObject({ ok: true, message: "Started playback." });
    expect(base.playback.calls).toEqual(["play:voice-1:https://example.com/a.mp3"]);
  });

  it("reports an append as queued instead of claiming it started playback", async () => {
    const base = deps();
    base.playback.play = async () => ({ ok: true, playing: false, position: 3 });
    const reply = await createMusicControlHandler(base)(
      request({ action: "play", query: "https://example.com/b.mp3", voiceChannelId: "voice-1" }),
    );
    expect(reply).toMatchObject({ ok: true, message: "Queued at position 3." });
  });

  it("validates loop, volume and remove values instead of coercing them", async () => {
    const handler = createMusicControlHandler(deps());
    expect(await handler(request({ action: "loop", value: "sideways" }))).toMatchObject({
      code: "loop_invalid",
    });
    expect(await handler(request({ action: "volume", value: "900" }))).toMatchObject({
      code: "volume_invalid",
    });
    expect(await handler(request({ action: "remove", value: 0 }))).toMatchObject({
      code: "position_invalid",
    });
  });

  it("refuses an unknown action after authorization", async () => {
    const handler = createMusicControlHandler(deps());
    const reply = await handler(request({ action: "explode" }));
    expect(reply).toMatchObject({ ok: false, code: "action_unknown" });
  });
});

describe("music state reporter", () => {
  it("publishes the node, player and the exact durable queue", async () => {
    const base = deps();
    await base.store.add(
      GUILD,
      parseTrack({
        query: "https://example.com/a.mp3",
        title: "Tone",
        requestedBy: "user-1",
        now: 1_700_000_000_000,
      }),
      10,
    );
    const bus = new InMemoryMusicControlBus();

    await publishMusicState(base, bus, GUILD);

    const state = await bus.readState(GUILD);
    expect(state?.node).toMatchObject({ name: "main", available: true, version: "4.2.2" });
    expect(state?.player).toMatchObject({ state: "playing", positionMs: 12_000 });
    expect(state?.queue.tracks.map((track) => track.title)).toEqual(["Tone"]);
  });

  it("heartbeats and reports only live guilds, then stops cleanly", async () => {
    const base = deps();
    const bus = new InMemoryMusicControlBus();
    const reporter = startMusicStateReporter({ bus, deps: base, intervalMs: 60_000 });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await bus.readHeartbeat()).toBeTruthy();
    expect(await bus.readState(GUILD)).toBeTruthy();

    reporter.stop();
    base.playback.active = [];
    await bus.close();
  });

  it("publishes one final idle state when a session stops being active", async () => {
    const base = deps();
    base.playback.active = [GUILD];
    const bus = new InMemoryMusicControlBus();
    const reporter = startMusicStateReporter({ bus, deps: base, intervalMs: 10 });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await bus.readState(GUILD)).toMatchObject({ player: { state: "playing" } });

    base.playback.current = {
      ...snapshot(),
      state: "idle",
      track: undefined,
      positionMs: 0,
      queueCount: 0,
    };
    base.playback.active = [];
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await bus.readState(GUILD)).toMatchObject({ player: { state: "idle" } });

    reporter.stop();
    await bus.close();
  });
});
