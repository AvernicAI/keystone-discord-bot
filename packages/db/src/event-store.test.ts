import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleEventStore } from "./event-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function store(): Promise<{ store: DrizzleEventStore; harness: PgliteHarness }> {
  const created = await createMigratedPglite();
  return { store: new DrizzleEventStore(created.db), harness: created };
}

const STARTS = "2026-11-05T18:00:00.000Z";

async function createEvent(
  store: DrizzleEventStore,
  overrides: { key?: string; capacity?: number } = {},
) {
  const result = await store.createEvent({
    guildId: "guild-a",
    key: overrides.key ?? "launch-night",
    name: "Launch night",
    description: "Ship it",
    state: "open",
    startsAt: STARTS,
    location: "voice stage",
    capacity: overrides.capacity,
    createdBy: "mod-1",
  });
  if (!result.ok) throw new Error("unexpected duplicate");
  return result.event;
}

describe("SQL event store", () => {
  it("enforces the guild-scoped key and resolves by key or id", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createEvent(setup.store);

    expect(await setup.store.getEvent("guild-a", "launch-night")).toMatchObject({
      id: created.id,
    });
    expect(await setup.store.getEvent("guild-a", created.id)).toMatchObject({
      key: "launch-night",
    });
    expect(await setup.store.getEvent("guild-b", "launch-night")).toBeUndefined();

    const duplicate = await setup.store.createEvent({
      guildId: "guild-a",
      key: "launch-night",
      name: "Another",
      description: "",
      state: "draft",
      startsAt: STARTS,
      location: "",
      createdBy: "mod-2",
    });
    expect(duplicate).toEqual({ ok: false, reason: "duplicate-key" });

    const updated = await setup.store.updateEvent("guild-a", created.id, {
      state: "closed",
    });
    expect(updated?.state).toBe("closed");

    const rows = await harness.runner.query<{ key: string; state: string }>(
      "select key, state from events where guild_id = 'guild-a'",
    );
    expect(rows).toEqual([{ key: "launch-night", state: "closed" }]);
  });

  it("allows one RSVP row per member and enforces capacity on going only", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createEvent(setup.store, { capacity: 1 });

    const first = await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-1",
      state: "going",
    });
    expect(first).toMatchObject({ ok: true, going: 1 });

    const second = await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-2",
      state: "going",
    });
    expect(second).toEqual({ ok: false, reason: "full", going: 1 });

    const declined = await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-2",
      state: "not_going",
    });
    expect(declined).toMatchObject({ ok: true, going: 1 });

    const changed = await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-1",
      state: "not_going",
    });
    expect(changed).toMatchObject({ ok: true, going: 0 });

    const taken = await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-2",
      state: "going",
    });
    expect(taken).toMatchObject({ ok: true, going: 1 });

    expect(await setup.store.countRsvps("guild-a", created.id)).toBe(2);
    expect(await setup.store.countRsvps("guild-a", created.id, "going")).toBe(1);

    const rows = await harness.runner.query<{ user_id: string; state: string }>(
      `select user_id, state from event_rsvps where event_id = '${created.id}' order by user_id`,
    );
    expect(rows).toEqual([
      { user_id: "member-1", state: "not_going" },
      { user_id: "member-2", state: "going" },
    ]);
  });

  it("records reminder bookkeeping and cascades RSVPs on delete", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createEvent(setup.store);

    await setup.store.upsertRsvp({
      guildId: "guild-a",
      eventId: created.id,
      userId: "member-1",
      state: "going",
    });
    const reminded = await setup.store.markReminded(
      "guild-a",
      created.id,
      "mod-1",
      new Date("2026-11-01T12:00:00.000Z"),
    );
    expect(reminded).toMatchObject({
      reminderCount: 1,
      remindedBy: "mod-1",
      remindedAt: "2026-11-01T12:00:00.000Z",
    });

    expect(await setup.store.deleteEvent("guild-a", created.id)).toBe(true);
    const rows = await harness.runner.query<{ count: string }>(
      "select count(*)::text as count from event_rsvps",
    );
    expect(rows[0]?.count).toBe("0");
  });

  it("stores the panel channel and claims one automatic reminder idempotently", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createEvent(setup.store);

    const attached = await setup.store.attachPanel("guild-a", created.id, "chan-9");
    expect(attached?.panelChannelId).toBe("chan-9");
    const [raw] = await harness.runner.query<{ panel_channel_id: string }>(
      `select panel_channel_id from events where id = '${created.id}'`,
    );
    expect(raw?.panel_channel_id).toBe("chan-9");

    const at = new Date("2026-11-05T17:00:00.000Z");
    const first = await setup.store.claimReminder("guild-a", created.id, at);
    expect(first).toMatchObject({
      remindedBy: "system",
      reminderCount: 1,
      remindedAt: at.toISOString(),
    });
    // The conditional update is the idempotency guard: the second claim is a
    // no-op even though the read above would still have looked due.
    expect(await setup.store.claimReminder("guild-a", created.id, at)).toBeUndefined();

    await setup.store.releaseReminder("guild-a", created.id);
    const released = await setup.store.getEvent("guild-a", created.id);
    expect(released).toMatchObject({ reminderCount: 0 });
    expect(released?.remindedAt).toBeUndefined();
    expect((await setup.store.claimReminder("guild-a", created.id, at))?.reminderCount).toBe(1);

    const closed = await createEvent(setup.store, { key: "closed-event" });
    await setup.store.updateEvent("guild-a", closed.id, { state: "closed" });
    expect(
      await setup.store.claimReminder("guild-a", closed.id, at),
    ).toBeUndefined();
  });
});
