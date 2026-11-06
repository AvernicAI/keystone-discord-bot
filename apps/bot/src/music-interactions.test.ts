import { describe, expect, it } from "vitest";
import {
  ComponentRouter,
  createComponentSigner,
  type ComponentInteractionLike,
  type ModuleSettings,
  type MusicPlayback,
  type MusicPlayerSnapshot,
  type ReplyInput,
} from "@keystone/kernel";
import {
  DJ_REFUSAL,
  MUSIC_DISABLED_MESSAGE,
  musicCustomId,
  musicDefaultSettings,
  musicSettingsSchema,
  type MusicPanelAction,
} from "@keystone/module-music";
import { registerMusicRoutes } from "./music-interactions";

const NOW = 1_800_000_000_000;
const signer = createComponentSigner("music-interaction-test-secret");
const GUILD = "1450130465146142785";

function snapshot(overrides: Partial<MusicPlayerSnapshot> = {}): MusicPlayerSnapshot {
  return {
    guildId: GUILD,
    voiceChannelId: "voice-1",
    textChannelId: "text-1",
    state: "playing",
    track: {
      id: "track-1",
      title: "Tone",
      uri: "https://example.com/tone.mp3",
      requestedBy: "user-1",
      addedAt: "2026-11-05T21:00:00.000Z",
    },
    positionMs: 5_000,
    volume: 80,
    loop: "off",
    queueCount: 3,
    updatedAt: "2026-11-05T21:00:00.000Z",
    ...overrides,
  };
}

function settings(values: Record<string, unknown> = {}): ModuleSettings {
  const parsed = musicSettingsSchema.parse({ enabled: true, ...values });
  return {
    async get() {
      return parsed;
    },
    async update() {
      throw new Error("card controls must never write settings");
    },
  };
}

class FakePlayback implements MusicPlayback {
  readonly calls: string[] = [];
  current: MusicPlayerSnapshot | undefined = snapshot();
  failStop = false;

  async status() {
    return { available: true, backend: "lavalink", configured: true, reason: "test", missing: [] };
  }
  async play() {
    return { ok: true };
  }
  async resume() {
    return { ok: true };
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
    return {
      ok: true,
      track: {
        id: "track-2",
        title: "Next",
        uri: "https://example.com/next.mp3",
        requestedBy: "user-1",
        addedAt: "2026-11-05T21:00:00.000Z",
      },
    };
  }
  async stop() {
    this.calls.push("stop");
    return this.failStop
      ? { ok: false, detail: "Nothing is playing. Use /music play." }
      : { ok: true, detail: "Stopped and disconnected." };
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
    this.calls.push("shuffle");
    return { ok: true, detail: "Shuffled 2 upcoming track(s)." };
  }
  async jump(_guildId: string, position: number) {
    this.calls.push(`jump:${position}`);
    return { ok: true, detail: `Jumped to position ${position}.` };
  }
  async remove() {
    return { ok: true };
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
}

interface ClickOptions {
  readonly permissions?: readonly string[];
  readonly roleIds?: readonly string[];
  readonly kind?: "button" | "select";
  readonly values?: readonly string[];
}

class Click implements ComponentInteractionLike {
  readonly replies: ReplyInput[] = [];
  replied = false;
  readonly kind: "button" | "select";
  readonly guildId = GUILD;
  readonly channelId = "text-1";
  readonly userId = "user-1";
  readonly permissions: readonly string[];
  readonly roleIds: readonly string[];
  readonly values?: readonly string[];

  constructor(
    readonly customId: string,
    options: ClickOptions = {},
  ) {
    this.kind = options.kind ?? "button";
    this.permissions = options.permissions ?? ["ManageGuild"];
    this.roleIds = options.roleIds ?? [];
    if (options.values) this.values = options.values;
  }

  async reply(input: ReplyInput): Promise<unknown> {
    this.replies.push(input);
    this.replied = true;
    return {};
  }
}

function fixture(values: Record<string, unknown> = {}, playback = new FakePlayback()) {
  const router = new ComponentRouter();
  const config = settings(values);
  registerMusicRoutes(router, { playback, settings: config });
  return { router, playback, config };
}

async function click(
  router: ComponentRouter,
  action: MusicPanelAction,
  options: ClickOptions = {},
): Promise<Click> {
  const interaction = new Click(musicCustomId(action, signer, NOW), options);
  expect(await router.dispatch(interaction, signer, NOW)).toBe(true);
  return interaction;
}

describe("music card routes", () => {
  it("pauses a playing and resumes a paused player through the same signed toggle", async () => {
    const { router, playback } = fixture();
    const paused = await click(router, "toggle");
    expect(paused.replies.at(-1)?.content).toBe("Paused.");

    playback.current = snapshot({ state: "paused" });
    const resumed = await click(router, "toggle");
    expect(resumed.replies.at(-1)?.content).toBe("Resumed.");
    expect(playback.calls).toEqual(["pause:true", "pause:false"]);
  });

  it("names the next track on skip and cycles loop off to track", async () => {
    const { router, playback } = fixture();
    const skipped = await click(router, "skip");
    expect(skipped.replies.at(-1)?.content).toBe("Skipped to Next.");

    const looped = await click(router, "loop");
    expect(looped.replies.at(-1)?.content).toBe("Loop is track.");
    expect(playback.calls).toEqual(["skip", "loop:track"]);
  });

  it("clamps volume buttons to the player range", async () => {
    const { router, playback } = fixture();
    playback.current = snapshot({ volume: 200 });
    await click(router, "volup");
    expect(playback.calls).toEqual(["volume:200"]);

    playback.current = snapshot({ volume: 0 });
    await click(router, "voldown");
    expect(playback.calls).toEqual(["volume:200", "volume:0"]);
  });

  it("uses the select's 1-based position for jump", async () => {
    const { router, playback } = fixture();
    const interaction = await click(router, "jump", { kind: "select", values: ["3"] });
    expect(interaction.replies.at(-1)?.content).toBe("Jumped to position 3.");
    expect(playback.calls).toEqual(["jump:3"]);
  });

  it("refuses a non-DJ when djOnly is on", async () => {
    const { router, playback } = fixture({ djOnly: true });
    const denied = await click(router, "skip", { permissions: [] });
    expect(denied.replies.at(-1)?.content).toBe(DJ_REFUSAL);
    expect(playback.calls).toEqual([]);
  });

  it("lets a configured DJ role through the same gate", async () => {
    const { router, playback } = fixture({
      djOnly: true,
      djRoleIds: "1450130465146142799",
    });
    await click(router, "skip", {
      permissions: [],
      roleIds: ["1450130465146142799"],
    });
    expect(playback.calls).toEqual(["skip"]);
  });

  it("refuses every control while the module is disabled", async () => {
    const { router, playback } = fixture({ enabled: false });
    const refused = await click(router, "skip");
    expect(refused.replies.at(-1)?.content).toBe(MUSIC_DISABLED_MESSAGE);
    expect(playback.calls).toEqual([]);
  });

  it("refuses a card whose player has gone idle instead of claiming a command", async () => {
    const { router, playback } = fixture();
    playback.current = undefined;
    const stale = await click(router, "skip");
    expect(stale.replies.at(-1)?.content).toContain("Nothing is playing");
    expect(playback.calls).toEqual([]);
  });

  it("raises the player's refusal for stop instead of printing success", async () => {
    const { router, playback } = fixture();
    playback.failStop = true;
    const refused = await click(router, "stop");
    expect(refused.replies.at(-1)?.content).toBe("Nothing is playing. Use /music play.");
  });

  it("refuses a forged or expired id before any handler runs", async () => {
    const { router, playback } = fixture();
    const forged = new Click(musicCustomId("skip", createComponentSigner("other-secret"), NOW));
    expect(await router.dispatch(forged, signer, NOW)).toBe(true);
    expect(forged.replies.at(-1)?.content).toContain("expired");
    expect(playback.calls).toEqual([]);
  });
});
