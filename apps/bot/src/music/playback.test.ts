import { describe, expect, it } from "vitest";
import { createSilentLogger, type ModuleSettings, type MusicPlayerSnapshot } from "@keystone/kernel";
import { InMemoryMusicStore, musicDefaultSettings } from "@keystone/module-music";
import { QueueMusicPlayback, type MusicPanelPort } from "./playback";
import type {
  VoiceEndReason,
  VoiceJoinInput,
  VoiceNode,
  VoicePlayer,
  VoiceResolveResult,
} from "./voice";

const GUILD = "guild-1";
const VOICE = "voice-1";
const TEXT = "text-1";

class FakePlayer implements VoicePlayer {
  readonly played: string[] = [];
  paused = false;
  position = 0;
  volume = 80;
  stops = 0;
  destroys = 0;
  #start: (() => void)[] = [];
  #end: ((reason: VoiceEndReason) => void)[] = [];
  #exception: ((message: string) => void)[] = [];

  async play(encoded: string): Promise<void> {
    this.played.push(encoded);
  }
  async pause(paused: boolean): Promise<void> {
    this.paused = paused;
  }
  async stop(): Promise<void> {
    this.stops += 1;
  }
  async setVolume(volume: number): Promise<void> {
    this.volume = volume;
  }
  async destroy(): Promise<void> {
    this.destroys += 1;
  }
  onStart(handler: () => void): void {
    this.#start.push(handler);
  }
  onEnd(handler: (reason: VoiceEndReason) => void): void {
    this.#end.push(handler);
  }
  onException(handler: (message: string) => void): void {
    this.#exception.push(handler);
  }
  onStuck(handler: () => void): void {
    this.#exception.push(() => handler());
  }
  onClosed(): void {}

  emitStart(): void {
    for (const handler of this.#start) handler();
  }
  emitEnd(reason: VoiceEndReason): void {
    for (const handler of this.#end) handler(reason);
  }
  emitException(message: string): void {
    for (const handler of this.#exception) handler(message);
  }
}

class FakeNode implements VoiceNode {
  readonly player = new FakePlayer();
  joins: VoiceJoinInput[] = [];
  leaves = 0;
  resolves: string[] = [];
  unknownTitle = false;

  async status() {
    return { name: "test", available: true, version: "4.2.2" };
  }
  async resolve(query: string): Promise<VoiceResolveResult> {
    this.resolves.push(query);
    return {
      ok: true,
      track: {
        encoded: `encoded:${query}`,
        info: {
          identifier: query,
          title: this.unknownTitle ? "Unknown title" : `Track ${query}`,
          author: this.unknownTitle ? "Unknown artist" : "Artist",
          length: 120_000,
          uri: query,
          isStream: false,
          sourceName: "http",
        },
      },
    };
  }
  async join(input: VoiceJoinInput): Promise<VoicePlayer> {
    this.joins.push(input);
    return this.player;
  }
  async leave(): Promise<void> {
    this.leaves += 1;
  }
  async close(): Promise<void> {}
}

function settings(): ModuleSettings & { values: Record<string, unknown> } {
  const values: Record<string, unknown> = { ...musicDefaultSettings, enabled: true, maxTracks: 10 };
  return {
    values,
    async get() {
      return values;
    },
    async update(_guildId: string, patch: Record<string, unknown>) {
      Object.assign(values, patch);
      return values;
    },
  };
}

function engine(panel?: MusicPanelPort) {
  const node = new FakeNode();
  const store = new InMemoryMusicStore();
  const playback = new QueueMusicPlayback(
    node,
    store,
    settings(),
    createSilentLogger(),
    panel,
    () => 1_700_000_000_000,
  );
  return { node, store, playback };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

async function play(
  playback: QueueMusicPlayback,
  url = "https://example.com/a.mp3",
): Promise<void> {
  const result = await playback.play({
    guildId: GUILD,
    userId: "user-1",
    query: url,
    voiceChannelId: VOICE,
    textChannelId: TEXT,
    maxTracks: 10,
    volume: 80,
  });
  expect(result.ok).toBe(true);
}

describe("QueueMusicPlayback", () => {
  it("joins voice, resolves the URL and starts the head of the durable queue", async () => {
    const { node, store, playback } = engine();
    await play(playback);

    expect(node.joins).toEqual([{ guildId: GUILD, voiceChannelId: VOICE, deaf: true }]);
    expect(node.player.played).toEqual(["encoded:https://example.com/a.mp3"]);
    expect((await store.list(GUILD)).tracks).toHaveLength(1);

    const snapshot = await playback.snapshot(GUILD);
    expect(snapshot).toMatchObject({
      guildId: GUILD,
      voiceChannelId: VOICE,
      textChannelId: TEXT,
      state: "playing",
      queueCount: 1,
      volume: 80,
      loop: "off",
    });
    expect(snapshot?.track?.title).toBe("Track https://example.com/a.mp3");
    expect(snapshot?.track?.durationMs).toBe(120_000);
    expect(snapshot?.track?.artist).toBe("Artist");
  });

  it("names a bare URL by its filename when the source has no tags", async () => {
    const { node, playback } = engine();
    node.unknownTitle = true;
    await play(playback, "https://example.com/My%20Song.mp3");

    const snapshot = await playback.snapshot(GUILD);
    expect(snapshot?.track?.title).toBe("My Song");
    expect(snapshot?.track?.artist).toBeUndefined();
  });

  it("appends later tracks without starting a second player", async () => {
    const { node, store, playback } = engine();
    await play(playback, "https://example.com/a.mp3");
    await play(playback, "https://example.com/b.mp3");

    expect(node.joins).toHaveLength(1);
    expect(node.player.played).toHaveLength(1);
    expect((await store.list(GUILD)).tracks.map((track) => track.title)).toEqual([
      "Track https://example.com/a.mp3",
      "Track https://example.com/b.mp3",
    ]);
  });

  it("moves the head when skip is called and keeps the queue's order", async () => {
    const { node, store, playback } = engine();
    await play(playback, "https://example.com/a.mp3");
    await play(playback, "https://example.com/b.mp3");

    const result = await playback.skip(GUILD);

    expect(result.ok).toBe(true);
    expect(result.track?.title).toBe("Track https://example.com/b.mp3");
    expect((await store.list(GUILD)).tracks).toHaveLength(1);
    expect(node.player.played).toEqual([
      "encoded:https://example.com/a.mp3",
      "encoded:https://example.com/b.mp3",
    ]);
  });

  it("replays the same encoded track for loop:track without touching the row", async () => {
    const { node, store, playback } = engine();
    await play(playback);
    await playback.setLoop(GUILD, "track");

    node.player.emitEnd("FINISHED");
    await flush();

    expect(node.player.played).toEqual([
      "encoded:https://example.com/a.mp3",
      "encoded:https://example.com/a.mp3",
    ]);
    expect((await store.list(GUILD)).tracks).toHaveLength(1);
  });

  it("rotates the queue for loop:queue when the head finishes", async () => {
    const { node, store, playback } = engine();
    await play(playback, "https://example.com/a.mp3");
    await play(playback, "https://example.com/b.mp3");
    await playback.setLoop(GUILD, "queue");

    node.player.emitEnd("FINISHED");
    await flush();

    expect((await store.list(GUILD)).tracks.map((track) => track.title)).toEqual([
      "Track https://example.com/b.mp3",
      "Track https://example.com/a.mp3",
    ]);
    expect(node.player.played.at(-1)).toBe("encoded:https://example.com/b.mp3");
  });

  it("does not treat a replacement end as a finished track", async () => {
    const { node, store, playback } = engine();
    await play(playback);
    node.player.emitEnd("REPLACED");
    await flush();

    expect(node.player.played).toHaveLength(1);
    expect((await store.list(GUILD)).tracks).toHaveLength(1);
  });

  it("clears audio and the queue but stays in voice for clear", async () => {
    const { node, store, playback } = engine();
    await play(playback);

    const result = await playback.clear(GUILD);

    expect(result.ok).toBe(true);
    expect(node.player.stops).toBe(1);
    expect(node.player.destroys).toBe(0);
    expect(node.leaves).toBe(0);
    expect((await store.list(GUILD)).tracks).toHaveLength(0);
  });

  it("destroys the player, clears the queue and leaves voice for stop", async () => {
    const { node, store, playback } = engine();
    await play(playback);

    await playback.stop(GUILD);

    expect(node.player.destroys).toBe(1);
    expect(node.leaves).toBe(1);
    expect((await store.list(GUILD)).tracks).toHaveLength(0);
    expect(await playback.snapshot(GUILD)).toMatchObject({ state: "idle", queueCount: 0 });
  });

  it("clamps volume and reports pause through the same snapshot the card reads", async () => {
    const { node, playback } = engine();
    await play(playback);

    await playback.setVolume(GUILD, 500);
    await playback.pause(GUILD, true);

    expect(node.player.volume).toBe(200);
    expect(node.player.paused).toBe(true);
    expect(await playback.snapshot(GUILD)).toMatchObject({ volume: 200, state: "paused" });
  });

  it("publishes the signed card target and the same queue the command reads", async () => {
    const published: { snapshot: MusicPlayerSnapshot; titles: string[] }[] = [];
    const panel: MusicPanelPort = {
      async publish(input) {
        published.push({
          snapshot: input.snapshot,
          titles: input.queue.tracks.map((track) => track.title),
        });
        return { channelId: input.channelId, messageId: "message-1" };
      },
    };
    const { playback } = engine(panel);
    await play(playback);

    expect(published.length).toBeGreaterThan(0);
    expect(published.at(-1)?.titles).toEqual(["Track https://example.com/a.mp3"]);
    expect(await playback.snapshot(GUILD)).toMatchObject({
      panelChannelId: TEXT,
      panelMessageId: "message-1",
    });
  });
});
