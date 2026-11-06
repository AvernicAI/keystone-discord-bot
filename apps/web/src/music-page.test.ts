import { describe, expect, it } from "vitest";
import type { MusicControlState } from "@keystone/kernel";
import type { DirectoryChannel } from "./directory";
import { renderMusic } from "./render";

const GUILD = { id: "1450130465146142785", name: "Keystone Lab", icon: null, owner: true, permissions: "0" };
const CSRF = "csrf-token";

const channels: DirectoryChannel[] = [
  { id: "voice-1", name: "Listening Room", kind: "voice", parentId: null, position: 0 },
  { id: "stage-1", name: "Stage", kind: "stage", parentId: null, position: 1 },
  { id: "text-1", name: "player-card", kind: "text", parentId: null, position: 2 },
  { id: "news-1", name: "announcements", kind: "announcement", parentId: null, position: 3 },
  { id: "forum-1", name: "requests", kind: "forum", parentId: null, position: 4 },
];

function state(overrides: Partial<MusicControlState> = {}): MusicControlState {
  return {
    guildId: GUILD.id,
    reportedAt: "2026-11-05T21:00:00.000Z",
    node: { name: "main", available: true, version: "4.2.2", pingMs: 12 },
    player: {
      guildId: GUILD.id,
      voiceChannelId: "voice-1",
      textChannelId: "text-1",
      state: "playing",
      track: {
        id: "track-1",
        title: "Midnight <City>",
        uri: "https://example.com/midnight.mp3",
        requestedBy: "1450130465146142799",
        addedAt: "2026-11-05T20:00:00.000Z",
        durationMs: 180_000,
        artist: "M83",
        artworkUrl: "https://example.com/art.jpg",
      },
      positionMs: 90_000,
      volume: 80,
      loop: "off",
      queueCount: 2,
      updatedAt: "2026-11-05T21:00:00.000Z",
    },
    queue: {
      guildId: GUILD.id,
      tracks: [
        {
          id: "track-1",
          title: "Midnight <City>",
          uri: "https://example.com/midnight.mp3",
          requestedBy: "1450130465146142799",
          addedAt: "2026-11-05T20:00:00.000Z",
          durationMs: 180_000,
          artist: "M83",
        },
        {
          id: "track-2",
          title: "Outro",
          uri: "https://example.com/outro.mp3",
          requestedBy: "1450130465146142800",
          addedAt: "2026-11-05T20:10:00.000Z",
          durationMs: 65_000,
        },
      ],
      updatedAt: "2026-11-05T21:00:00.000Z",
    },
    ...overrides,
  };
}

describe("renderMusic", () => {
  it("renders the reported player, progress and the durable queue", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state(),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain("Midnight &lt;City&gt;");
    expect(html).toContain("M83");
    expect(html).toContain("1:30");
    expect(html).toContain("3:00");
    expect(html).toContain("Outro");
    expect(html).toContain("playing");
    expect(html).toContain("Node <b>main</b> · 4.2.2");
  });

  it("escapes the track title instead of trusting resolver metadata", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state(),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).not.toContain("Midnight <City>");
    expect(html).not.toContain("<City>");
  });

  it("posts every control to the signed guild route with the CSRF token", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state(),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain('/dashboard/guilds/1450130465146142785/music/control');
    expect((html.match(/name="csrf"/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('name="action" value="pause"');
    expect(html).toContain('name="action" value="skip"');
    expect(html).toContain('name="value" value="2"');
  });

  it("never labels a dead session's head as the track playing now", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state(),
      available: true,
      fresh: false,
      enabled: true,
      channels,
    });
    expect(html).toContain("Last known state, not live.");
    expect(html).not.toContain('<span class="pill brand">now</span>');
    expect(html).toContain('<span class="pill warn">last report');
  });

  it("unpauses a paused player instead of restarting the durable queue", () => {
    // "Resume" used to post action=resume, which starts the saved queue from
    // its head. On a paused player that is a lie: the bot answered "Resumed."
    // and the node stayed paused. The pause control carries value=false.
    const base = state();
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: { ...base, player: { ...base.player!, state: "paused" } },
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain("▶ Resume");
    expect(html).toContain('name="action" value="pause"');
    expect(html).toContain('name="value" value="false"');
    expect(html).not.toContain('name="action" value="resume"');
  });

  it("offers only real voice and text channels to the start form", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state(),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain("Listening Room");
    expect(html).toContain("Stage");
    expect(html).toContain("player-card");
    expect(html).toContain("announcements");
    expect(html).not.toContain("requests");
  });

  it("resumes with the same chosen voice channel instead of a dead form", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state({
        player: { ...state().player!, state: "idle", track: undefined },
        queue: state().queue,
      }),
      available: true,
      enabled: true,
      channels,
    });
    const resume = html.indexOf('name="action" value="resume"');
    const voice = html.indexOf('name="voiceChannelId"');
    expect(voice).toBeGreaterThan(-1);
    expect(resume).toBeGreaterThan(voice);
    expect(html).toContain('value="voice-1" selected');
    expect(html).toContain("Resume starts the durable queue from its head");
  });

  it("does not offer resume when the durable queue is empty", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state({
        player: undefined,
        queue: { guildId: GUILD.id, tracks: [], updatedAt: "2026-11-05T21:00:00.000Z" },
      }),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).not.toContain('name="action" value="resume"');
  });

  it("shows the saved queue from the durable row when no bot state exists", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      queue: state().queue,
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain("2 tracks");
    expect(html).toContain("Outro");
    expect(html).toContain('name="action" value="resume"');
    expect(html).not.toContain("The queue is empty.");
  });

  it("does not present a dead session as live after a restart", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state({
        player: { ...state().player!, state: "playing" },
      }),
      available: true,
      fresh: false,
      enabled: true,
      channels,
    });
    expect(html).toContain("Last known state, not live.");
    expect(html).toContain("last report");
    expect(html).not.toContain('name="action" value="pause"');
    // The durable queue is still real, so resume remains available.
    expect(html).toContain('name="action" value="resume"');
  });

  it("says exactly why the page is read-only when no bot reports", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      available: false,
      enabled: true,
      channels,
      unavailableReason: "No heartbeat from the bot in the last 20 seconds.",
    });
    expect(html).toContain("No bot is reporting");
    expect(html).toContain("No heartbeat from the bot in the last 20 seconds.");
    expect(html).toContain("The page is honest about it.");
    expect(html).not.toContain('name="action" value="skip"');
  });

  it("names the disabled module instead of starting a player", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      available: true,
      enabled: false,
      channels,
    });
    expect(html).toContain("Music is disabled in this server");
    expect(html).not.toContain('name="query"');
    expect(html).not.toContain('name="action" value="play"');
  });

  it("renders an empty queue without inventing a track", () => {
    const html = renderMusic("Ada", GUILD, CSRF, {
      state: state({
        player: undefined,
        queue: { guildId: GUILD.id, tracks: [], updatedAt: "2026-11-05T21:00:00.000Z" },
      }),
      available: true,
      enabled: true,
      channels,
    });
    expect(html).toContain("The queue is empty.");
    expect(html).toContain("Nothing playing");
    expect(html).not.toContain("Now playing <span class=\"pill ok\">playing");
  });
});
