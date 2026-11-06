import { describe, expect, it } from "vitest";
import {
  InMemoryCooldownStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  auditBudget,
  createSilentLogger,
  dispatchCommand,
} from "@keystone/kernel";
import { FakeInteraction, createTestContext, noopQueue, staticHealth } from "@keystone/testing";
import { musicModule } from "./manifest";
import { music } from "./commands/music";
import { InMemoryMusicStore } from "./store";
import { MUSIC_DISABLED_MESSAGE, MusicService, parseTrack } from "./music";
import { PLAYBACK_UNAVAILABLE_REASON, UnavailableMusicPlayback } from "./playback";

const GUILD = "guild-1";
const USER = "user-1";

function service(maxTracks = 2, enabled = true) {
  const store = new InMemoryMusicStore();
  const settings = {
    store: { enabled, maxTracks },
    get: async () => ({ enabled, maxTracks }),
    update: async (_guildId: string, patch: Record<string, unknown>) => ({ enabled, maxTracks, ...patch }),
  };
  return {
    store,
    settings,
    service: new MusicService(store, new UnavailableMusicPlayback(), settings, () => 1_700_000_000_000),
  };
}

function context(
  subcommand: string,
  options: Record<string, string | number | boolean | null> = {},
  overrides: { enabled?: boolean; permissions?: string[] } = {},
) {
  const store = new InMemoryMusicStore();
  const interaction = new FakeInteraction({
    commandName: "music",
    guildId: GUILD,
    userId: USER,
    subcommand,
    options,
    voiceChannelId: "voice-1",
    permissions: overrides.permissions ?? ["ManageGuild"],
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "music",
    settings: { enabled: overrides.enabled ?? true, maxTracks: 2 },
    music: { store, playback: new UnavailableMusicPlayback() },
  });
  return { ctx, interaction, store };
}

describe("/music command", () => {
  it("registers one root with fourteen subcommands inside the budget", () => {
    const registry = new ModuleRegistry().register(musicModule);
    expect(registry.getCommand("music")?.moduleId).toBe("music");
    expect(registry.getCommand("music")?.definition.subcommands?.map((entry) => entry.name)).toEqual([
      "play",
      "resume",
      "pause",
      "skip",
      "stop",
      "queue",
      "add",
      "remove",
      "clear",
      "volume",
      "loop",
      "shuffle",
      "jump",
      "status",
    ]);
    expect(auditBudget(registry).commands).toBe(1);
    expect(auditBudget(registry).subcommands).toBe(14);
  });

  it("saves a real row and reports the count from the store", async () => {
    const { ctx, interaction, store } = context("add", {
      query: "https://example.com/audio/tone.mp3",
      title: "Test tone",
    });
    await music.execute(ctx);

    const queue = await store.list(GUILD);
    expect(queue.tracks).toHaveLength(1);
    expect(queue.tracks[0]).toMatchObject({
      title: "Test tone",
      uri: "https://example.com/audio/tone.mp3",
      requestedBy: USER,
    });
    expect(interaction.lastReply?.content).toContain("position 1/2");
    expect(interaction.lastReply?.content).toContain("Use `/music play` with no query");
  });

  it("lists the play queue with the current track at its head", async () => {
    const { ctx, interaction, store } = context("queue");
    await store.add(
      GUILD,
      parseTrack({
        query: "https://example.com/tone.mp3",
        title: "Tone",
        requestedBy: USER,
        now: 1_700_000_000_000,
      }),
      2,
    );
    await music.execute(ctx);

    expect(interaction.lastReply?.content).toContain("Play queue · 1/2 · no player");
    expect(interaction.lastReply?.content).toContain("**Tone**");
    expect(interaction.lastReply?.content).toContain("The head is the current track");
  });

  it("removes one track by position and clears the rest", async () => {
    const { ctx, interaction, store } = context("remove", { position: 1 });
    await store.add(
      GUILD,
      parseTrack({ query: "https://example.com/a.mp3", requestedBy: USER, now: 1 }),
      2,
    );
    await music.execute(ctx);
    expect((await store.list(GUILD)).tracks).toHaveLength(0);
    expect(interaction.lastReply?.content).toContain("Removed");

    const cleared = context("clear");
    await cleared.store.add(
      GUILD,
      parseTrack({ query: "https://example.com/b.mp3", requestedBy: USER, now: 1 }),
      2,
    );
    await music.execute(cleared.ctx);
    expect(cleared.interaction.lastReply?.content).toContain("Cleared 1 track(s)");
  });

  it("refuses clear for a caller without ManageGuild", async () => {
    const clear = context("clear", {}, { permissions: ["SendMessages"] });
    await expect(music.execute(clear.ctx)).rejects.toThrow(/ManageGuild/);
  });

  it("refuses playback with the exact missing-backend reason and does not queue the URL", async () => {
    const { ctx, interaction, store } = context("play", { query: "https://example.com/tone.mp3" });
    await expect(music.execute(ctx)).rejects.toThrow(PLAYBACK_UNAVAILABLE_REASON);
    expect(interaction.lastReply).toBeUndefined();
    expect((await store.list(GUILD)).tracks).toHaveLength(0);
  });

  it("refuses skip and stop when there is no player", async () => {
    const skip = context("skip");
    await expect(music.execute(skip.ctx)).rejects.toThrow(/Nothing was skipped/);
    const stop = context("stop");
    await expect(music.execute(stop.ctx)).rejects.toThrow(/Nothing was stopped/);
  });

  it("status works while disabled and names the enabling command", async () => {
    const { ctx, interaction } = context("status", {}, { enabled: false });
    await music.execute(ctx);
    expect(interaction.lastReply?.content).toContain("Music is disabled");
    expect(interaction.lastReply?.content).toContain("playback UNAVAILABLE");
    expect(interaction.lastReply?.content).toContain("/config set module=music key=enabled value=true");
    expect(interaction.lastReply?.content).toContain("Queue record: 0 track(s)");
    expect(interaction.lastReply?.content).toContain("community_records` in SQL mode");
  });
});

describe("music service", () => {
  it("enforces the saved-queue cap inside the store", async () => {
    const { service: musicService } = service(2);
    await musicService.add(GUILD, USER, "https://example.com/a.mp3");
    await musicService.add(GUILD, USER, "https://example.com/b.mp3");
    await expect(musicService.add(GUILD, USER, "https://example.com/c.mp3")).rejects.toThrow(
      /queue is full \(2 tracks\)/,
    );
  });

  it("isolates queues by guild", async () => {
    const { service: musicService, store } = service(2);
    await musicService.add(GUILD, USER, "https://example.com/a.mp3");
    await musicService.add("guild-2", USER, "https://example.com/b.mp3");
    expect((await store.list(GUILD)).tracks).toHaveLength(1);
    expect((await store.list("guild-2")).tracks).toHaveLength(1);
  });

  it("refuses every queue operation except status when disabled", async () => {
    const { service: musicService } = service(2, false);
    await expect(musicService.add(GUILD, USER, "https://example.com/a.mp3")).rejects.toThrow(
      MUSIC_DISABLED_MESSAGE,
    );
    await expect(musicService.list(GUILD)).rejects.toThrow(MUSIC_DISABLED_MESSAGE);
    await expect(
      musicService.play({
        guildId: GUILD,
        userId: USER,
        query: "https://example.com/a.mp3",
        voiceChannelId: "voice-1",
      }),
    ).rejects.toThrow(MUSIC_DISABLED_MESSAGE);
    await expect(musicService.status(GUILD)).resolves.toMatchObject({
      tracks: 0,
      settings: { enabled: false, maxTracks: 2 },
    });
  });

  it("rejects non-http URLs and URLs with embedded credentials", () => {
    expect(() =>
      parseTrack({ query: "javascript:alert(1)", requestedBy: USER, now: 1 }),
    ).toThrow(/http and https/);
    expect(() =>
      parseTrack({ query: "https://user:pass@example.com/a.mp3", requestedBy: USER, now: 1 }),
    ).toThrow(/username and password/);
    expect(() => parseTrack({ query: "not a url", requestedBy: USER, now: 1 })).toThrow(/not a URL/);
  });
});

describe("music dispatch", () => {
  it("blocks a caller without ManageGuild from a destructive queue action", async () => {
    const registry = new ModuleRegistry().register(musicModule);
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    await settings.update(GUILD, "music", { enabled: true, maxTracks: 2 });
    const store = new InMemoryMusicStore();
    const interaction = new FakeInteraction({
      commandName: "music",
      guildId: GUILD,
      subcommand: "clear",
      permissions: ["SendMessages"],
    });

    const outcome = await dispatchCommand(
      {
        registry,
        settings,
        logger: createSilentLogger(),
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
        music: { store, playback: new UnavailableMusicPlayback() },
      },
      interaction,
    );

    expect(outcome.status).toBe("error");
    expect(interaction.lastReply?.content).toContain("ManageGuild");
    expect((await store.list(GUILD)).tracks).toHaveLength(0);
  });

  it("runs the real dispatch path for an enabled guild", async () => {
    const registry = new ModuleRegistry().register(musicModule);
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    await settings.update(GUILD, "music", { enabled: true, maxTracks: 2 });
    const store = new InMemoryMusicStore();
    const interaction = new FakeInteraction({
      commandName: "music",
      guildId: GUILD,
      subcommand: "add",
      options: { query: "https://example.com/dispatch.mp3" },
      permissions: ["SendMessages"],
    });

    const outcome = await dispatchCommand(
      {
        registry,
        settings,
        logger: createSilentLogger(),
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
        music: { store, playback: new UnavailableMusicPlayback() },
      },
      interaction,
    );

    expect(outcome.status).toBe("ok");
    expect(interaction.lastReply?.content).toContain("Saved");
    expect(interaction.lastReply?.content).toContain("position 1/2");
    expect((await store.list(GUILD)).tracks).toHaveLength(1);
  });
});
