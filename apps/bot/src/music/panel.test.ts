import { describe, expect, it } from "vitest";
import type { Client } from "discord.js";
import {
  createComponentSigner,
  createSilentLogger,
  type MusicPlayerSnapshot,
  type MusicQueue,
} from "@keystone/kernel";
import { createMusicPanelPublisher } from "./panel";

const GUILD = "1450130465146142785";
const TEXT = "1450130465146142786";

const snapshot: MusicPlayerSnapshot = {
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
  positionMs: 0,
  volume: 80,
  loop: "off",
  queueCount: 1,
  updatedAt: "2026-11-05T21:00:00.000Z",
};

const queue: MusicQueue = {
  guildId: GUILD,
  tracks: snapshot.track ? [snapshot.track] : [],
  updatedAt: "2026-11-05T21:00:00.000Z",
};

function client(): { client: Client; sends: () => number; edits: () => number } {
  let sends = 0;
  let edits = 0;
  const message = {
    id: "message-1",
    async edit() {
      edits += 1;
    },
  };
  const channel = {
    isTextBased: () => true,
    isSendable: () => true,
    messages: { fetch: async () => message },
    async send() {
      sends += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { id: "message-1" };
    },
  };
  const fake = {
    channels: { fetch: async () => channel },
  } as unknown as Client;
  return { client: fake, sends: () => sends, edits: () => edits };
}

describe("music card publisher", () => {
  it("posts once when two triggers race before the first card exists", async () => {
    const fake = client();
    const publisher = createMusicPanelPublisher({
      client: fake.client,
      signer: createComponentSigner("panel-test-secret"),
      logger: createSilentLogger(),
      now: () => 1_800_000_000_000,
      throttleMs: 1_500,
    });

    const input = { guildId: GUILD, channelId: TEXT, snapshot, queue };
    await Promise.all([publisher.publish(input), publisher.publish(input)]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fake.sends()).toBe(1);
    expect(fake.edits()).toBe(1);
  });

  it("throttles a later state change into one edit instead of a new message", async () => {
    let now = 1_800_000_000_000;
    const fake = client();
    const publisher = createMusicPanelPublisher({
      client: fake.client,
      signer: createComponentSigner("panel-test-secret"),
      logger: createSilentLogger(),
      now: () => now,
      throttleMs: 1_500,
    });

    await publisher.publish({ guildId: GUILD, channelId: TEXT, snapshot, queue });
    now += 100;
    await publisher.publish({
      guildId: GUILD,
      channelId: TEXT,
      snapshot: { ...snapshot, state: "paused" },
      queue,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(fake.sends()).toBe(1);
    expect(fake.edits()).toBe(1);
  });
});
