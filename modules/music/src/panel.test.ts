import { describe, expect, it } from "vitest";
import { ACCENTS, GLYPHS } from "@keystone/ui";
import type { MusicPlayerSnapshot, MusicQueue, MusicTrack } from "@keystone/kernel";
import { formatDuration, musicCustomId, musicPanel } from "./panel";

const READ_AT = Date.UTC(2026, 10, 5, 21, 0, 0);
const GUILD = "guild-1";

function track(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: "track-1",
    title: "Midnight City",
    uri: "https://example.com/midnight.mp3",
    requestedBy: "user-1",
    addedAt: "2026-11-05T20:00:00.000Z",
    durationMs: 180_000,
    artist: "M83",
    artworkUrl: "https://example.com/art.jpg",
    ...overrides,
  };
}

function snapshot(overrides: Partial<MusicPlayerSnapshot> = {}): MusicPlayerSnapshot {
  return {
    guildId: GUILD,
    voiceChannelId: "voice-1",
    textChannelId: "text-1",
    state: "playing",
    track: track(),
    positionMs: 90_000,
    volume: 80,
    loop: "off",
    queueCount: 2,
    updatedAt: "2026-11-05T21:00:00.000Z",
    ...overrides,
  };
}

function queue(): MusicQueue {
  return {
    guildId: GUILD,
    tracks: [track(), track({ id: "track-2", title: "Outro", artist: "Vangelis", uri: "https://example.com/outro.mp3" })],
    updatedAt: "2026-11-05T21:00:00.000Z",
  };
}

const signer = { sign: ({ action }: { action: string }) => `signed:${action}` };

function rendered(panel: ReturnType<typeof musicPanel>): string {
  return JSON.stringify(panel);
}

describe("musicPanel", () => {
  it("renders the player, duration and the node's reported position", () => {
    const text = rendered(musicPanel(snapshot(), queue(), { readAt: READ_AT }));
    expect(text).toContain(GLYPHS.music);
    expect(text).toContain("Midnight City");
    expect(text).toContain("M83");
    expect(text).toContain("Playing");
    expect(text).toContain("1:30 / 3:00");
    expect(text).toContain("80% volume");
    expect(text).toContain("2 in queue");
    expect(text).toContain("https://example.com/art.jpg");
  });

  it("uses the playing accent and the attention accent for a paused player", () => {
    expect(musicPanel(snapshot(), queue(), { readAt: READ_AT })[0]).toMatchObject({
      accentColor: ACCENTS.ok,
    });
    expect(
      musicPanel(snapshot({ state: "paused" }), queue(), { readAt: READ_AT })[0],
    ).toMatchObject({ accentColor: ACCENTS.attention });
  });

  it("shows only upcoming tracks and keeps the jump select at valid positions", () => {
    const text = rendered(musicPanel(snapshot(), queue(), { signer, readAt: READ_AT }));
    expect(text).toContain("Outro");
    expect(text).not.toContain("1. Midnight City");
    expect(text).toContain("signed:jump");
    expect(text).toContain('"value":"2"');
  });

  it("signs every card control with the action name and no guild payload", () => {
    expect(musicCustomId("skip", signer, READ_AT)).toBe("signed:skip");
  });

  it("is read-only without a signer", () => {
    const text = rendered(musicPanel(snapshot(), queue(), { readAt: READ_AT }));
    expect(text).not.toContain("action-row");
    expect(text).not.toContain("signed:");
  });

  it("says nothing is queued instead of inventing an upcoming track", () => {
    const only = { ...queue(), tracks: [track()] };
    const text = rendered(musicPanel(snapshot({ queueCount: 1 }), only, { signer, readAt: READ_AT }));
    expect(text).toContain("Nothing is queued after this track.");
    expect(text).not.toContain("signed:jump");
  });

  it("renders an idle player without a fake track or a duration", () => {
    const idle = snapshot({
      state: "idle",
      track: undefined,
      positionMs: 0,
      queueCount: 0,
    });
    const text = rendered(musicPanel(idle, { ...queue(), tracks: [] }, { signer, readAt: READ_AT }));
    expect(text).toContain("Nothing playing");
    expect(text).toContain("Join a voice channel");
    expect(text).not.toContain("0:00");
    expect(text).not.toContain("signed:jump");
  });

  it("shows a saved queue when the player is idle instead of calling it empty", () => {
    const idle = snapshot({
      state: "idle",
      track: undefined,
      positionMs: 0,
      queueCount: 1,
    });
    const text = rendered(
      musicPanel(idle, { ...queue(), tracks: [track()] }, { signer, readAt: READ_AT }),
    );
    expect(text).toContain("1 saved track wait");
    expect(text).not.toContain("the queue is empty");
    expect(text).toContain("1. Midnight City");
    expect(text).toContain('"value":"1"');
  });

  it("formats durations without inventing one for a missing length", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });
});
