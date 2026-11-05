import { describe, expect, it } from "vitest";
import { createComponentSigner, createSilentLogger } from "@keystone/kernel";
import {
  InMemoryEventStore,
  eventDefaultSettings,
  type EventPanel,
} from "@keystone/module-events";
import { sweepEventReminders } from "./event-reminders";

const GUILD = "guild-1";
const NOW = Date.parse("2026-11-05T17:30:00.000Z");

function settings(overrides: Record<string, unknown> = {}) {
  const value = { ...eventDefaultSettings, ...overrides };
  return {
    get: async () => ({ ...value }),
    update: async () => ({ ...value }),
  };
}

async function dueEvent(store: InMemoryEventStore): Promise<void> {
  const created = await store.createEvent({
    guildId: GUILD,
    key: "launch-night",
    name: "Launch night",
    description: "Ship it",
    state: "open",
    startsAt: new Date(NOW + 30 * 60_000).toISOString(),
    location: "voice stage",
    createdBy: "mod-1",
  });
  if (!created.ok) throw new Error("event fixture missing");
  await store.attachPanel(GUILD, created.event.id, "chan-1");
}

function deps(
  store: InMemoryEventStore,
  post: (channelId: string, panel: EventPanel) => Promise<void>,
  overrides: Record<string, unknown> = {},
) {
  return {
    store,
    settings: settings(overrides),
    signer: createComponentSigner("keystone-test-secret"),
    poster: { post },
  };
}

describe("event reminder tick", () => {
  it("posts one panel through the recorded channel and is idle on the next tick", async () => {
    const store = new InMemoryEventStore();
    await dueEvent(store);
    const posted: { channelId: string; panel: EventPanel }[] = [];
    const runtime = deps(store, async (channelId, panel) => {
      posted.push({ channelId, panel });
    });
    const logger = createSilentLogger();

    const first = await sweepEventReminders(runtime, logger, GUILD, NOW);
    expect(first.sent).toEqual(["launch-night"]);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.channelId).toBe("chan-1");
    expect(posted[0]?.panel.reply.embeds?.[0]?.title).toBe("Reminder 1: Launch night");
    const buttons = posted[0]?.panel.reply.components?.[0]?.components ?? [];
    expect(buttons).toHaveLength(2);

    const second = await sweepEventReminders(runtime, logger, GUILD, NOW + 60_000);
    expect(second.sent).toEqual([]);
    expect(posted).toHaveLength(1);
  });

  it("does nothing when the events module is disabled", async () => {
    const store = new InMemoryEventStore();
    await dueEvent(store);
    const posted: string[] = [];
    const runtime = deps(store, async (channelId) => {
      posted.push(channelId);
    }, { enabled: false });

    const sweep = await sweepEventReminders(
      runtime,
      createSilentLogger(),
      GUILD,
      NOW,
    );
    expect(sweep).toEqual({ sent: [], failed: [], skipped: 0 });
    expect(posted).toEqual([]);
  });

  it("releases the claim when the channel send fails so a later tick retries", async () => {
    const store = new InMemoryEventStore();
    await dueEvent(store);
    let fail = true;
    const runtime = deps(store, async () => {
      if (fail) throw new Error("missing access");
    });

    const first = await sweepEventReminders(runtime, createSilentLogger(), GUILD, NOW);
    expect(first.failed).toEqual(["launch-night"]);
    expect(
      (await store.getEvent(GUILD, "launch-night"))?.remindedAt,
    ).toBeUndefined();

    fail = false;
    const second = await sweepEventReminders(
      runtime,
      createSilentLogger(),
      GUILD,
      NOW + 60_000,
    );
    expect(second.sent).toEqual(["launch-night"]);
  });
});
