import { describe, expect, it } from "vitest";
import { InMemoryCommunityStore } from "./store";
import { RecordingCommunityActions } from "./testing";
import { AutoResponderService } from "./responder";
import { communitySettingsSchema } from "./settings";

function setup(overrides: Record<string, unknown> = {}) {
  const store = new InMemoryCommunityStore();
  const actions = new RecordingCommunityActions();
  const settings = communitySettingsSchema.parse({
    responders: { enabled: true, max: 5, cooldownSeconds: 0, ...overrides },
  });
  let now = Date.parse("2026-11-01T12:00:00.000Z");
  const service = new AutoResponderService(store, actions, settings, () => now);
  return {
    store,
    actions,
    settings,
    service,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe("auto-responder", () => {
  it("matches exact, contains and regex triggers without treating one as another", async () => {
    const { service, actions } = setup();
    await service.save("guild-a", {
      trigger: "hello",
      match: "exact",
      response: "Exact greeting.",
      createdBy: "mod",
    });
    await service.save("guild-a", {
      trigger: "new world",
      match: "contains",
      response: "Contains greeting.",
      createdBy: "mod",
    });
    await service.save("guild-a", {
      trigger: "\\bping\\b",
      match: "regex",
      response: "Regex pong.",
      createdBy: "mod",
    });

    expect(await service.respond("guild-a", "channel-a", "HELLO")).toMatchObject({
      response: "Exact greeting.",
    });
    expect(await service.respond("guild-a", "channel-a", "hello there")).toBeUndefined();
    expect(await service.respond("guild-a", "channel-a", "Brave New World")).toMatchObject({
      response: "Contains greeting.",
    });
    expect(await service.respond("guild-a", "channel-a", "please ping me")).toMatchObject({
      response: "Regex pong.",
    });
    expect(actions.sent.map((entry) => entry.message.content)).toEqual([
      "Exact greeting.",
      "Contains greeting.",
      "Regex pong.",
    ]);
    expect(actions.sent.every((entry) => entry.message.allowedMentions?.parse.length === 0)).toBe(
      true,
    );
  });

  it("prefers exact over contains regardless of save order and sends only one reply", async () => {
    const { service, actions } = setup();
    await service.save("guild-a", {
      trigger: "help",
      match: "contains",
      response: "Contains help.",
      createdBy: "mod",
    });
    await service.save("guild-a", {
      trigger: "help",
      match: "exact",
      response: "Exact help.",
      createdBy: "mod",
    });

    const hit = await service.respond("guild-a", "channel-a", "help");
    expect(hit?.response).toBe("Exact help.");
    expect(actions.sent).toHaveLength(1);
  });

  it("enforces a per-trigger cooldown and releases it after the window", async () => {
    const { service, actions, advance } = setup();
    await service.save("guild-a", {
      trigger: "hello",
      match: "exact",
      response: "Hi.",
      createdBy: "mod",
      cooldownSeconds: 10,
    });

    expect(await service.respond("guild-a", "channel-a", "hello")).toBeDefined();
    expect(await service.respond("guild-a", "channel-a", "hello")).toBeUndefined();
    expect(actions.sent).toHaveLength(1);

    advance(10_001);
    expect(await service.respond("guild-a", "channel-a", "hello")).toBeDefined();
    expect(actions.sent).toHaveLength(2);
  });

  it("does nothing when disabled and validates operator input", async () => {
    const { store, actions, service, settings } = setup({ enabled: false });
    await service.save("guild-a", {
      trigger: "hello",
      match: "exact",
      response: "Hi.",
      createdBy: "mod",
    });
    expect(await service.respond("guild-a", "channel-a", "hello")).toBeUndefined();
    expect(actions.sent).toHaveLength(0);

    await expect(
      service.save("guild-a", {
        trigger: "[unclosed",
        match: "regex",
        response: "Nope.",
        createdBy: "mod",
      }),
    ).rejects.toThrow(/regular expression/i);

    await expect(
      service.save("guild-a", {
        trigger: "hello",
        match: "exact",
        response: "Duplicate.",
        createdBy: "mod",
      }),
    ).rejects.toThrow(/already exists/i);

    const full = setup({ max: 1 });
    await full.service.save("guild-a", {
      trigger: "one",
      match: "exact",
      response: "One.",
      createdBy: "mod",
    });
    await expect(
      full.service.save("guild-a", {
        trigger: "two",
        match: "exact",
        response: "Two.",
        createdBy: "mod",
      }),
    ).rejects.toThrow(/reached 1 auto-responders/i);

    expect(settings.responders.enabled).toBe(false);
    expect(await store.listRecords("guild-a", "responder")).toHaveLength(1);
  });

  it("lists and removes records by id", async () => {
    const { service } = setup();
    const record = await service.save("guild-a", {
      trigger: "hello",
      match: "exact",
      response: "Hi.",
      createdBy: "mod",
    });
    expect(await service.list("guild-a")).toHaveLength(1);
    expect(await service.remove("guild-a", "missing")).toBe(false);
    expect(await service.remove("guild-a", record.id)).toBe(true);
    expect(await service.list("guild-a")).toHaveLength(0);
  });
});
