import { randomUUID } from "node:crypto";
import type {
  EventCreateResult,
  EventDefinition,
  EventPatch,
  EventRsvp,
  EventRsvpFilter,
  EventRsvpResult,
  EventState,
  EventStore,
  NewEvent,
  NewEventRsvp,
  RsvpState,
} from "@keystone/kernel";

const nowIso = (): string => new Date().toISOString();

/**
 * In-memory event store.
 *
 * It is a real store, not a mock: keys are unique per guild, one member has at
 * most one RSVP row, capacity counts `going` rows, and a reminder increments
 * the bookkeeping. Tests use it; a deployment swaps the Postgres adapter behind
 * the same port.
 */
export class InMemoryEventStore implements EventStore {
  readonly #events = new Map<string, EventDefinition>();
  readonly #rsvps = new Map<string, EventRsvp>();

  async createEvent(input: NewEvent): Promise<EventCreateResult> {
    const duplicate = [...this.#events.values()].find(
      (event) => event.guildId === input.guildId && event.key === input.key,
    );
    if (duplicate) return { ok: false, reason: "duplicate-key" };

    const at = nowIso();
    const event: EventDefinition = {
      id: randomUUID(),
      guildId: input.guildId,
      key: input.key,
      name: input.name,
      description: input.description,
      state: input.state,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      capacity: input.capacity,
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
      reminderCount: 0,
    };
    this.#events.set(event.id, event);
    return { ok: true, event };
  }

  async getEvent(
    guildId: string,
    reference: string,
  ): Promise<EventDefinition | undefined> {
    const events = [...this.#events.values()].filter(
      (event) => event.guildId === guildId,
    );
    return events.find((event) => event.key === reference) ?? events.find((event) => event.id === reference);
  }

  async listEvents(guildId: string, limit = 50): Promise<EventDefinition[]> {
    return [...this.#events.values()]
      .filter((event) => event.guildId === guildId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.key.localeCompare(b.key))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async updateEvent(
    guildId: string,
    eventId: string,
    patch: EventPatch,
    timestamps?: { startsAt?: Date; endsAt?: Date | null },
  ): Promise<EventDefinition | undefined> {
    const current = this.#events.get(eventId);
    if (!current || current.guildId !== guildId) return undefined;

    const updated: EventDefinition = {
      ...current,
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      state: (patch.state as EventState | undefined) ?? current.state,
      startsAt: timestamps?.startsAt?.toISOString() ?? current.startsAt,
      endsAt:
        timestamps && "endsAt" in timestamps
          ? timestamps.endsAt?.toISOString()
          : current.endsAt,
      location: patch.location ?? current.location,
      capacity:
        patch.capacity === null
          ? undefined
          : patch.capacity !== undefined
            ? patch.capacity
            : current.capacity,
      updatedAt: nowIso(),
    };
    this.#events.set(eventId, updated);
    return updated;
  }

  async deleteEvent(guildId: string, eventId: string): Promise<boolean> {
    const current = this.#events.get(eventId);
    if (!current || current.guildId !== guildId) return false;
    for (const [id, rsvp] of this.#rsvps) {
      if (rsvp.eventId === eventId) this.#rsvps.delete(id);
    }
    this.#events.delete(eventId);
    return true;
  }

  async countRsvps(
    guildId: string,
    eventId: string,
    state?: RsvpState,
  ): Promise<number> {
    return [...this.#rsvps.values()].filter(
      (rsvp) =>
        rsvp.guildId === guildId &&
        rsvp.eventId === eventId &&
        (!state || rsvp.state === state),
    ).length;
  }

  async getRsvp(
    guildId: string,
    eventId: string,
    userId: string,
  ): Promise<EventRsvp | undefined> {
    return [...this.#rsvps.values()].find(
      (rsvp) =>
        rsvp.guildId === guildId && rsvp.eventId === eventId && rsvp.userId === userId,
    );
  }

  async listRsvps(
    guildId: string,
    eventId: string,
    filter: EventRsvpFilter = {},
  ): Promise<EventRsvp[]> {
    return [...this.#rsvps.values()]
      .filter(
        (rsvp) =>
          rsvp.guildId === guildId &&
          rsvp.eventId === eventId &&
          (!filter.state || rsvp.state === filter.state),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.min(Math.max(filter.limit ?? 50, 1), 100));
  }

  async upsertRsvp(input: NewEventRsvp): Promise<EventRsvpResult> {
    const event = this.#events.get(input.eventId);
    if (!event || event.guildId !== input.guildId) throw new Error("Event not found");

    const existing = [...this.#rsvps.values()].find(
      (rsvp) =>
        rsvp.guildId === input.guildId &&
        rsvp.eventId === input.eventId &&
        rsvp.userId === input.userId,
    );
    const going = [...this.#rsvps.values()].filter(
      (rsvp) =>
        rsvp.guildId === input.guildId &&
        rsvp.eventId === input.eventId &&
        rsvp.state === "going",
    ).length;

    if (
      input.state === "going" &&
      existing?.state !== "going" &&
      event.capacity !== undefined &&
      going >= event.capacity
    ) {
      return { ok: false, reason: "full", going };
    }

    const at = nowIso();
    const rsvp: EventRsvp = existing
      ? { ...existing, state: input.state, updatedAt: at }
      : {
          id: randomUUID(),
          guildId: input.guildId,
          eventId: input.eventId,
          userId: input.userId,
          state: input.state,
          createdAt: at,
          updatedAt: at,
        };
    this.#rsvps.set(rsvp.id, rsvp);

    const nextGoing =
      input.state === "going"
        ? existing?.state === "going"
          ? going
          : going + 1
        : existing?.state === "going"
          ? going - 1
          : going;
    return { ok: true, rsvp, going: nextGoing };
  }

  async markReminded(
    guildId: string,
    eventId: string,
    remindedBy: string,
    at: Date,
  ): Promise<EventDefinition | undefined> {
    const current = this.#events.get(eventId);
    if (!current || current.guildId !== guildId) return undefined;
    const updated: EventDefinition = {
      ...current,
      remindedAt: at.toISOString(),
      remindedBy,
      reminderCount: current.reminderCount + 1,
      updatedAt: nowIso(),
    };
    this.#events.set(eventId, updated);
    return updated;
  }
}
