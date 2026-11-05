import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createComponentSigner } from "@keystone/kernel";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import type { EventStore } from "@keystone/kernel";
import { event } from "./commands/event";
import { EventService, parseInstant } from "./events";
import { buildEventCalendar } from "./ics";
import { buildEventPanel, eventPanelTtlMs, type EventPanel } from "./panel";
import { EventReminderService } from "./reminders";
import { eventDefaultSettings } from "./settings";
import { InMemoryEventStore } from "./store";

const STARTS = "2026-11-05T18:00:00.000Z";
const ENDS = "2026-11-05T20:00:00.000Z";

function context(
  store: EventStore,
  options: {
    subcommand: string;
    values?: Record<string, string | number>;
    permissions?: string[];
    userId?: string;
    settings?: Record<string, unknown>;
  },
) {
  const interaction = new FakeInteraction({
    commandName: "event",
    subcommand: options.subcommand,
    options: options.values ?? {},
    permissions: options.permissions ?? ["ManageGuild"],
    userId: options.userId ?? "mod-1",
  });
  return createTestContext({
    moduleId: "events",
    interaction,
    events: store,
    settings: options.settings ?? eventDefaultSettings,
  });
}

async function createOpenEvent(store: EventStore, capacity?: number): Promise<void> {
  await event.execute(
    context(store, {
      subcommand: "create",
      values: {
        name: "Launch night",
        starts: STARTS,
        ends: ENDS,
        location: "voice stage",
        ...(capacity === undefined ? {} : { capacity }),
      },
    }),
  );
  await event.execute(
    context(store, {
      subcommand: "edit",
      values: { event: "launch-night", state: "open" },
    }),
  );
}

describe("event parsing", () => {
  it("normalises a real date and refuses a string that is not one", () => {
    expect(parseInstant("2026-11-05T18:00:00Z")).toBe(STARTS);
    // Local time is accepted and normalised to an ISO instant; the exact UTC
    // hour depends on the machine's zone, so only the shape is asserted.
    expect(parseInstant("2026-11-05 18:00")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    expect(() => parseInstant("soon")).toThrow(/must be a date/);
    expect(() => parseInstant("")).toThrow(/must be a date/);
  });
});

describe("/event vertical slice", () => {
  it("flows create → open → rsvp → remind and reads the rows back", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store, 2);

    const created = await store.getEvent("1", "launch-night");
    expect(created).toMatchObject({
      key: "launch-night",
      name: "Launch night",
      state: "open",
      startsAt: STARTS,
      endsAt: ENDS,
      location: "voice stage",
      capacity: 2,
      reminderCount: 0,
      createdBy: "mod-1",
    });

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-2",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );

    expect(await store.countRsvps("1", created!.id, "going")).toBe(2);
    expect(await store.countRsvps("1", created!.id, "not_going")).toBe(0);

    await expect(
      event.execute(
        context(store, {
          subcommand: "rsvp",
          userId: "member-3",
          permissions: [],
          values: { event: "launch-night", rsvp: "going" },
        }),
      ),
    ).rejects.toThrow(/is full \(2 going\)/);

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-3",
        permissions: [],
        values: { event: "launch-night", rsvp: "not_going" },
      }),
    );
    expect(await store.countRsvps("1", created!.id, "not_going")).toBe(1);
    expect(await store.countRsvps("1", created!.id)).toBe(3);

    await event.execute(
      context(store, { subcommand: "remind", values: { event: "launch-night" } }),
    );
    const reminded = await store.getEvent("1", "launch-night");
    expect(reminded?.reminderCount).toBe(1);
    expect(reminded?.remindedBy).toBe("mod-1");
    expect(reminded?.remindedAt).toBeTruthy();

    const list = context(store, { subcommand: "list" });
    await event.execute(list);
    expect(list.interaction.lastReply?.content).toBe("1 event in this server.");
    expect(list.interaction.lastReply?.embeds?.[0]?.description).toContain("2/2 going");
    expect(list.interaction.lastReply?.embeds?.[0]?.description).toContain("1 not going");
  });

  it("keeps exactly one RSVP row per member and lets them change their mind", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store);
    const created = await store.getEvent("1", "launch-night");

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "not_going" },
      }),
    );

    expect(await store.countRsvps("1", created!.id)).toBe(1);
    expect(await store.countRsvps("1", created!.id, "going")).toBe(0);
    expect((await store.getRsvp("1", created!.id, "member-1"))?.state).toBe("not_going");
    expect(await store.getRsvp("1", created!.id, "member-2")).toBeUndefined();
  });

  it("only counts going rows against capacity and lets a decline free a seat", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store, 1);
    const created = await store.getEvent("1", "launch-night");

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    await expect(
      event.execute(
        context(store, {
          subcommand: "rsvp",
          userId: "member-2",
          permissions: [],
          values: { event: "launch-night", rsvp: "going" },
        }),
      ),
    ).rejects.toThrow(/is full/);

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "not_going" },
      }),
    );
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-2",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    expect(await store.countRsvps("1", created!.id, "going")).toBe(1);
  });

  it("refuses RSVPs outside the open state and reminders on a draft", async () => {
    const store = new InMemoryEventStore();
    await event.execute(
      context(store, {
        subcommand: "create",
        values: { name: "Draft only", starts: STARTS },
      }),
    );

    await expect(
      event.execute(
        context(store, {
          subcommand: "rsvp",
          userId: "member-1",
          permissions: [],
          values: { event: "draft-only", rsvp: "going" },
        }),
      ),
    ).rejects.toThrow(/is draft and is not accepting RSVPs/);
    await expect(
      event.execute(context(store, { subcommand: "remind", values: { event: "draft-only" } })),
    ).rejects.toThrow(/Only an open event can be reminded/);

    await event.execute(
      context(store, {
        subcommand: "edit",
        values: { event: "draft-only", state: "closed" },
      }),
    );
    await expect(
      event.execute(
        context(store, {
          subcommand: "rsvp",
          userId: "member-1",
          permissions: [],
          values: { event: "draft-only", rsvp: "going" },
        }),
      ),
    ).rejects.toThrow(/is closed/);
  });

  it("refuses deletion while attendance exists and deletes an unused draft", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store);
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    await expect(
      event.execute(
        context(store, {
          subcommand: "delete",
          values: { event: "launch-night", confirm: "launch-night" },
        }),
      ),
    ).rejects.toThrow(/has 1 RSVP/);

    await event.execute(
      context(store, {
        subcommand: "create",
        values: { name: "Unused", starts: STARTS },
      }),
    );
    await event.execute(
      context(store, {
        subcommand: "delete",
        values: { event: "unused", confirm: "unused" },
      }),
    );
    expect(await store.getEvent("1", "unused")).toBeUndefined();
    expect(await store.getEvent("1", "launch-night")).toBeTruthy();
  });

  it("refuses management subcommands without ManageGuild but allows a member RSVP", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store);

    await expect(
      event.execute(
        context(store, {
          subcommand: "create",
          permissions: [],
          values: { name: "Nope", starts: STARTS },
        }),
      ),
    ).rejects.toThrow(/Missing permission: ManageGuild/);
    await expect(
      event.execute(
        context(store, {
          subcommand: "remind",
          permissions: [],
          values: { event: "launch-night" },
        }),
      ),
    ).rejects.toThrow(/Missing permission: ManageGuild/);

    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    expect(await store.countRsvps("1", (await store.getEvent("1", "launch-night"))!.id)).toBe(1);
  });

  it("honours the enabled switch for writes but still reads and exports rows", async () => {
    const store = new InMemoryEventStore();
    await createOpenEvent(store);
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );

    const disabled = { ...eventDefaultSettings, enabled: false };
    await expect(
      event.execute(
        context(store, {
          subcommand: "create",
          settings: disabled,
          values: { name: "Other", starts: STARTS },
        }),
      ),
    ).rejects.toThrow(/Events are disabled here/);
    await expect(
      event.execute(
        context(store, {
          subcommand: "rsvp",
          userId: "member-2",
          permissions: [],
          settings: disabled,
          values: { event: "launch-night", rsvp: "going" },
        }),
      ),
    ).rejects.toThrow(/Events are disabled here/);

    const listed = context(store, { subcommand: "list", settings: disabled });
    await event.execute(listed);
    expect(listed.interaction.lastReply?.content).toBe("1 event in this server.");

    const exported = context(store, { subcommand: "export", settings: disabled });
    await event.execute(exported);
    const file = exported.interaction.lastReply?.files?.[0];
    expect(file?.name).toBe("keystone.events.1.json");
    const payload = JSON.parse(file?.content ?? "{}") as {
      counts: { events: number; rsvps: number };
      checksum: string;
    };
    expect(payload.counts).toEqual({ events: 1, rsvps: 1 });
    const { checksum, ...withoutChecksum } = payload;
    expect(checksum).toBe(
      createHash("sha256").update(JSON.stringify(withoutChecksum)).digest("hex"),
    );
  });

  it("enforces the event cap and the capacity bound from settings", async () => {
    const store = new InMemoryEventStore();
    const service = new EventService(store, { ...eventDefaultSettings, maxEvents: 1 });
    await service.create("1", "mod-1", { name: "One", starts: STARTS });
    await expect(
      service.create("1", "mod-1", { name: "Two", starts: STARTS }),
    ).rejects.toThrow(/already has 1 events/);

    const limited = new EventService(store, { ...eventDefaultSettings, maxRsvpsPerEvent: 10 });
    await expect(
      limited.create("1", "mod-1", { name: "Big", starts: STARTS, capacity: 11 }),
    ).rejects.toThrow(/Capacity must be between 1 and 10/);
    await expect(
      limited.create("1", "mod-1", { name: "Bad", starts: STARTS, ends: "2026-11-05T17:00:00Z" }),
    ).rejects.toThrow(/ends before it starts/);
  });
});

describe("event panel, calendar and tick reminder", () => {
  async function openWithPanel(store: InMemoryEventStore) {
    await createOpenEvent(store, 2);
    const event = await store.getEvent("1", "launch-night");
    if (!event) throw new Error("event fixture missing");
    return event;
  }

  function reminderService(
    store: EventStore,
    posted: { channelId: string; panel: EventPanel }[],
    now: number,
    failOnce = false,
  ): EventReminderService {
    const signer = createComponentSigner("keystone-test-secret");
    let failed = false;
    return new EventReminderService(
      store,
      { ...eventDefaultSettings, reminderLeadMinutes: 60 },
      signer,
      {
        async post(channelId, panel) {
          if (failOnce && !failed) {
            failed = true;
            throw new Error("discord said no");
          }
          posted.push({ channelId, panel });
        },
      },
      () => now,
    );
  }

  async function seedDueEvent(store: InMemoryEventStore): Promise<void> {
    await store.createEvent({
      guildId: "1",
      key: "launch-night",
      name: "Launch night",
      description: "Ship it",
      state: "open",
      startsAt: "2026-11-05T18:00:00.000Z",
      location: "voice stage",
      createdBy: "mod-1",
    });
    const created = await store.getEvent("1", "launch-night");
    if (!created) throw new Error("event fixture missing");
    await store.attachPanel("1", created.id, "chan-9");
  }

  it("opens as a public panel with two signed buttons and records the channel", async () => {
    const store = new InMemoryEventStore();
    await event.execute(
      context(store, {
        subcommand: "create",
        values: { name: "Launch night", starts: STARTS, capacity: 2 },
      }),
    );
    const opened = context(store, {
      subcommand: "edit",
      values: { event: "launch-night", state: "open" },
    });
    await event.execute(opened);

    const row = await store.getEvent("1", "launch-night");
    expect(row?.panelChannelId).toBe("99");
    const reply = opened.interaction.lastReply;
    expect(reply?.ephemeral).toBeUndefined();
    expect(reply?.embeds?.[0]?.title).toBe("Event open: Launch night");

    const buttons = (reply?.components?.[0]?.components ?? []).map((component) =>
      "customId" in component ? component.customId : "",
    );
    expect(buttons).toHaveLength(2);
    const signer = createComponentSigner("keystone-test-secret");
    expect(buttons.map((id) => signer.parse(id, opened.now()))).toEqual([
      expect.objectContaining({
        ok: true,
        namespace: "event",
        action: "going",
        payload: row?.id,
      }),
      expect.objectContaining({
        ok: true,
        namespace: "event",
        action: "not_going",
        payload: row?.id,
      }),
    ]);
    // The panel outlives the command, but it is not immortal.
    const parsed = signer.parse(buttons[0] ?? "", opened.now());
    expect(parsed.ok && parsed.expiresAt > Date.parse(ENDS)).toBe(true);
  });

  it("attaches an ICS calendar derived from the same exported RSVP rows", async () => {
    const store = new InMemoryEventStore();
    await openWithPanel(store);
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-1",
        permissions: [],
        values: { event: "launch-night", rsvp: "going" },
      }),
    );
    await event.execute(
      context(store, {
        subcommand: "rsvp",
        userId: "member-2",
        permissions: [],
        values: { event: "launch-night", rsvp: "not_going" },
      }),
    );

    const exported = context(store, {
      subcommand: "export",
      values: { event: "launch-night" },
    });
    await event.execute(exported);
    const files = exported.interaction.lastReply?.files ?? [];
    expect(files.map((file) => file.name)).toEqual([
      "keystone.events.1.launch-night.json",
      "keystone.events.1.launch-night.ics",
    ]);

    const payload = JSON.parse(files[0]?.content ?? "{}") as {
      counts: { events: number; rsvps: number };
      events: { id: string }[];
    };
    const ics = files[1]?.content ?? "";
    expect(payload.counts).toEqual({ events: 1, rsvps: 2 });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain(`UID:${payload.events[0]?.id}@keystone`);
    expect(ics).toContain("DTSTART:20261105T180000Z");
    expect(ics).toContain("DTEND:20261105T200000Z");
    expect(ics).toContain("SUMMARY:Launch night");
    expect(ics).toContain("ATTENDEE;CN=member-1;PARTSTAT=ACCEPTED");
    expect(ics).toContain("ATTENDEE;CN=member-2;PARTSTAT=DECLINED");
    expect(ics).toContain("X-KEYSTONE-GOING:1");
    // One attendee line per RSVP row in the JSON: no second read path.
    expect(ics.match(/^ATTENDEE/gm)).toHaveLength(payload.counts.rsvps);
  });

  it("escapes reserved calendar text and folds lines at 75 octets", () => {
    const ics = buildEventCalendar({
      generatedAt: "2026-11-01T00:00:00.000Z",
      events: [
        {
          id: "event-1",
          guildId: "1",
          key: "launch",
          name: "Launch, night; part 2",
          description: `${"long ".repeat(24)}\nsecond line`,
          state: "open",
          startsAt: "2026-11-05T18:00:00.000Z",
          location: "Stage, left",
          createdBy: "mod-1",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
          reminderCount: 0,
        },
      ],
      rsvps: [],
    });

    expect(ics).toContain(String.raw`SUMMARY:Launch\, night\; part 2`);
    expect(ics).toContain(String.raw`LOCATION:Stage\, left`);
    expect(ics).toContain(String.raw`\nsecond line`);
    const lines = ics.split("\r\n");
    expect(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });

  it("sends one reminder from the tick and skips events with no panel or lead window", async () => {
    const store = new InMemoryEventStore();
    await seedDueEvent(store);
    await store.createEvent({
      guildId: "1",
      key: "late",
      name: "Late",
      description: "",
      state: "open",
      startsAt: "2026-11-05T21:00:00.000Z",
      location: "",
      createdBy: "mod-1",
    });
    await store.createEvent({
      guildId: "1",
      key: "unannounced",
      name: "Unannounced",
      description: "",
      state: "open",
      startsAt: "2026-11-05T17:45:00.000Z",
      location: "",
      createdBy: "mod-1",
    });

    const posted: { channelId: string; panel: EventPanel }[] = [];
    const now = Date.parse("2026-11-05T17:30:00.000Z");
    const service = reminderService(store, posted, now);
    const sweep = await service.sweep("1");

    expect(sweep.sent).toEqual(["launch-night"]);
    expect(sweep.skipped).toBe(2);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.channelId).toBe("chan-9");
    const row = await store.getEvent("1", "launch-night");
    expect(row).toMatchObject({
      remindedBy: "system",
      reminderCount: 1,
      remindedAt: "2026-11-05T17:30:00.000Z",
    });
    expect((await service.sweep("1")).sent).toEqual([]);
    expect(posted).toHaveLength(1);
  });

  it("releases a failed reminder claim so the next tick can retry", async () => {
    const store = new InMemoryEventStore();
    await seedDueEvent(store);
    const posted: { channelId: string; panel: EventPanel }[] = [];
    const now = Date.parse("2026-11-05T17:30:00.000Z");
    const service = reminderService(store, posted, now, true);

    expect((await service.sweep("1")).failed).toEqual(["launch-night"]);
    expect((await store.getEvent("1", "launch-night"))?.remindedAt).toBeUndefined();
    expect((await service.sweep("1")).sent).toEqual(["launch-night"]);
    expect(posted).toHaveLength(1);
  });
});
