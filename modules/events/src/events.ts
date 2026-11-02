import { UserError } from "@keystone/kernel";
import type {
  EventDefinition,
  EventRsvp,
  EventState,
  EventStore,
  EventSummary,
  RsvpState,
} from "@keystone/kernel";
import type { EventSettings } from "./settings";

const KEY = /^[a-z][a-z0-9-]{0,31}$/;
const STATES = new Set(["draft", "open", "closed"]);
const RSVP_STATES = new Set(["going", "not_going"]);

/** Turn a display name into the stable key every subcommand accepts. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Parse the `starts`/`ends` option into an ISO instant.
 *
 * `Date.parse` accepts ISO strings and the common `YYYY-MM-DD HH:mm` form. A
 * string that does not parse is refused rather than stored as an invalid date:
 * an event nobody can sort or remind against is worse than no event.
 */
export function parseInstant(raw: string, label = "start"): string {
  const value = raw.trim();
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) {
    throw new UserError(
      `The ${label} must be a date like \`2026-11-05T18:00:00Z\` or \`2026-11-05 18:00\`.`,
    );
  }
  return new Date(parsed).toISOString();
}

export interface EventExport {
  readonly format: "keystone.events";
  readonly version: 1;
  readonly guildId: string;
  readonly generatedAt: string;
  readonly counts: { events: number; rsvps: number };
  readonly events: readonly EventDefinition[];
  readonly rsvps: readonly EventRsvp[];
}

export interface RsvpOutcome {
  readonly event: EventDefinition;
  readonly rsvp: EventRsvp;
  readonly going: number;
}

/**
 * The state machine behind `/event`.
 *
 * One owner for lifecycle, capacity and reminder bookkeeping. The store enforces
 * the structural rules (unique key, one RSVP row per member, atomic capacity);
 * this service owns the operator-facing rules that need settings or a clock.
 *
 * RSVP ownership is deliberate: `rsvp` takes the member id from the invoking
 * interaction and has no user option, so no command can write another member's
 * row. `remind` is the only management-side write and it never touches RSVPs.
 */
export class EventService {
  constructor(
    private readonly store: EventStore,
    private readonly settings: EventSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async create(
    guildId: string,
    actorId: string,
    input: {
      name: string;
      key?: string;
      description?: string;
      starts: string;
      ends?: string;
      location?: string;
      capacity?: number;
    },
  ): Promise<EventDefinition> {
    this.#requireEnabled("create an event");
    const existing = await this.store.listEvents(guildId, 100);
    if (existing.length >= this.settings.maxEvents) {
      throw new UserError(
        `This server already has ${this.settings.maxEvents} events. Delete an unused one first.`,
      );
    }

    const name = input.name.trim();
    if (!name) throw new UserError("Give the event a name.");
    const key = input.key?.trim() ? slugify(input.key) : slugify(name);
    if (!KEY.test(key)) {
      throw new UserError(
        "The event key must start with a letter and use letters, digits or dashes.",
      );
    }
    if (existing.some((event) => event.key === key)) {
      throw new UserError(`An event with key \`${key}\` already exists.`);
    }

    const startsAt = parseInstant(input.starts);
    const endsAt = input.ends?.trim() ? parseInstant(input.ends, "end") : undefined;
    if (endsAt && endsAt < startsAt) {
      throw new UserError("The event ends before it starts.");
    }
    const capacity = this.#capacity(input.capacity);

    const result = await this.store.createEvent({
      guildId,
      key,
      name,
      description: input.description?.trim() ?? "",
      state: "draft",
      startsAt,
      endsAt,
      location: input.location?.trim() ?? "",
      capacity,
      createdBy: actorId,
    });
    if (!result.ok) throw new UserError(`An event with key \`${key}\` already exists.`);
    return result.event;
  }

  async edit(
    guildId: string,
    reference: string,
    patch: {
      name?: string;
      description?: string;
      starts?: string;
      ends?: string;
      location?: string;
      capacity?: number;
      state?: string;
    },
  ): Promise<EventDefinition> {
    const event = await this.#resolve(guildId, reference);

    const state = patch.state?.trim();
    if (state && !STATES.has(state)) {
      throw new UserError("State must be draft, open or closed.");
    }
    const name = patch.name?.trim();
    if (name !== undefined && !name) throw new UserError("The event name cannot be empty.");

    const startsAt = patch.starts?.trim() ? new Date(parseInstant(patch.starts)) : undefined;
    const endsAt = patch.ends?.trim() ? new Date(parseInstant(patch.ends, "end")) : undefined;
    const effectiveStart = startsAt?.toISOString() ?? event.startsAt;
    const effectiveEnd = endsAt?.toISOString() ?? event.endsAt;
    if (effectiveEnd && effectiveEnd < effectiveStart) {
      throw new UserError("The event ends before it starts.");
    }

    const capacity =
      patch.capacity === undefined ? undefined : this.#capacity(patch.capacity) ?? null;

    const updated = await this.store.updateEvent(
      guildId,
      event.id,
      {
        name: name || undefined,
        description: patch.description?.trim(),
        location: patch.location?.trim(),
        capacity,
        state: state as EventState | undefined,
      },
      {
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
      },
    );
    if (!updated) throw new UserError(`Event \`${event.key}\` was not found.`);
    return updated;
  }

  async remove(
    guildId: string,
    reference: string,
    confirm: string,
  ): Promise<EventDefinition> {
    const event = await this.#resolve(guildId, reference);
    if (confirm.trim() !== event.key) {
      throw new UserError(`Refusing to delete. Pass confirm:${event.key} to remove this event.`);
    }
    const rsvps = await this.store.countRsvps(guildId, event.id);
    if (rsvps > 0) {
      throw new UserError(
        `Event \`${event.key}\` has ${rsvps} RSVP${rsvps === 1 ? "" : "s"}. Close it with \`/event edit event:${event.key} state:closed\` instead; attendance history is never deleted here.`,
      );
    }
    const deleted = await this.store.deleteEvent(guildId, event.id);
    if (!deleted) throw new UserError(`Event \`${event.key}\` was not found.`);
    return event;
  }

  async list(guildId: string): Promise<EventSummary[]> {
    const events = await this.store.listEvents(guildId, 100);
    return Promise.all(
      events.map(async (event) => ({
        event,
        going: await this.store.countRsvps(guildId, event.id, "going"),
        notGoing: await this.store.countRsvps(guildId, event.id, "not_going"),
      })),
    );
  }

  /**
   * Record the invoking member's RSVP. The user id is a parameter from the
   * interaction, never an option, which is the ownership rule.
   */
  async rsvp(
    guildId: string,
    userId: string,
    reference: string,
    state: string,
  ): Promise<RsvpOutcome> {
    this.#requireEnabled("RSVP to an event");
    if (!RSVP_STATES.has(state)) {
      throw new UserError("RSVP must be going or not_going.");
    }
    const event = await this.#resolve(guildId, reference);
    if (event.state !== "open") {
      throw new UserError(
        `Event \`${event.key}\` is ${event.state} and is not accepting RSVPs.`,
      );
    }

    const current = await this.store.getRsvp(guildId, event.id, userId);
    if (
      state === "going" &&
      current?.state !== "going" &&
      event.capacity !== undefined
    ) {
      const going = await this.store.countRsvps(guildId, event.id, "going");
      if (going >= event.capacity) {
        throw new UserError(
          `Event \`${event.key}\` is full (${event.capacity} going).`,
        );
      }
    }

    const result = await this.store.upsertRsvp({
      guildId,
      eventId: event.id,
      userId,
      state: state as RsvpState,
    });
    if (!result.ok) {
      throw new UserError(
        `Event \`${event.key}\` is full (${event.capacity} going).`,
      );
    }
    return { event, rsvp: result.rsvp, going: result.going };
  }

  /**
   * Record that a reminder was sent. Delivery is the command's job; this method
   * owns only the bookkeeping, so a future scheduler can call the same write.
   */
  async remind(
    guildId: string,
    actorId: string,
    reference: string,
  ): Promise<{ event: EventDefinition; going: number }> {
    const event = await this.#resolve(guildId, reference);
    if (event.state !== "open") {
      throw new UserError(
        `Event \`${event.key}\` is ${event.state}. Only an open event can be reminded.`,
      );
    }
    const reminded = await this.store.markReminded(
      guildId,
      event.id,
      actorId,
      new Date(this.now()),
    );
    if (!reminded) throw new UserError(`Event \`${event.key}\` was not found.`);
    return {
      event: reminded,
      going: await this.store.countRsvps(guildId, event.id, "going"),
    };
  }

  async export(guildId: string, reference?: string): Promise<EventExport> {
    const event = reference ? await this.#resolve(guildId, reference) : undefined;
    const events = event ? [event] : await this.store.listEvents(guildId, 100);
    const rsvps: EventRsvp[] = [];
    for (const entry of events) {
      rsvps.push(...(await this.store.listRsvps(guildId, entry.id, { limit: 100 })));
    }
    return {
      format: "keystone.events",
      version: 1,
      guildId,
      generatedAt: new Date(this.now()).toISOString(),
      counts: { events: events.length, rsvps: rsvps.length },
      events,
      rsvps,
    };
  }

  /** 0 and undefined both mean unlimited; a positive value is the hard cap. */
  #capacity(value: number | undefined): number | undefined {
    if (value === undefined || value === 0) return undefined;
    if (!Number.isInteger(value) || value < 1 || value > this.settings.maxRsvpsPerEvent) {
      throw new UserError(
        `Capacity must be between 1 and ${this.settings.maxRsvpsPerEvent}, or 0 for unlimited.`,
      );
    }
    return value;
  }

  async #resolve(guildId: string, reference: string): Promise<EventDefinition> {
    const event = await this.store.getEvent(guildId, reference.trim());
    if (!event) throw new UserError(`Event \`${reference}\` was not found. Use \`/event list\`.`);
    return event;
  }

  #requireEnabled(action: string): void {
    if (!this.settings.enabled) {
      throw new UserError(
        `Events are disabled here. Enable them with \`/config set module=events key=enabled value=true\` to ${action}.`,
      );
    }
  }
}
