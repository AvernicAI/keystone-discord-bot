import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
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
import { eventRsvps, events } from "./schema";
import type { schema } from "./schema";

type EventRow = typeof events.$inferSelect;
type RsvpRow = typeof eventRsvps.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toEvent(row: EventRow): EventDefinition {
  return {
    id: row.id,
    guildId: row.guildId,
    key: row.key,
    name: row.name,
    description: row.description,
    state: row.state as EventState,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString(),
    location: row.location,
    capacity: row.capacity ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    remindedAt: row.remindedAt?.toISOString(),
    remindedBy: row.remindedBy ?? undefined,
    reminderCount: row.reminderCount,
  };
}

function toRsvp(row: RsvpRow): EventRsvp {
  return {
    id: row.id,
    guildId: row.guildId,
    eventId: row.eventId,
    userId: row.userId,
    state: row.state as RsvpState,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Postgres adapter for events. The capacity check runs inside the same
 * transaction as the write, after locking the event row, so two members racing
 * for the last seat cannot both win. It counts `going` rows directly; there is
 * no cached counter to drift.
 */
export class DrizzleEventStore implements EventStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async createEvent(input: NewEvent): Promise<EventCreateResult> {
    const [row] = await this.db
      .insert(events)
      .values({
        guildId: input.guildId,
        key: input.key,
        name: input.name,
        description: input.description,
        state: input.state,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        location: input.location,
        capacity: input.capacity ?? null,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({ target: [events.guildId, events.key] })
      .returning();
    if (!row) return { ok: false, reason: "duplicate-key" };
    return { ok: true, event: toEvent(row) };
  }

  async getEvent(
    guildId: string,
    reference: string,
  ): Promise<EventDefinition | undefined> {
    const [byKey] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.guildId, guildId), eq(events.key, reference)))
      .limit(1);
    if (byKey) return toEvent(byKey);
    if (!UUID.test(reference)) return undefined;

    const [byId] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.guildId, guildId), eq(events.id, reference)))
      .limit(1);
    return byId ? toEvent(byId) : undefined;
  }

  async listEvents(guildId: string, limit = 50): Promise<EventDefinition[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(eq(events.guildId, guildId))
      .orderBy(asc(events.startsAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toEvent);
  }

  async updateEvent(
    guildId: string,
    eventId: string,
    patch: EventPatch,
    timestamps?: { startsAt?: Date; endsAt?: Date | null },
  ): Promise<EventDefinition | undefined> {
    if (!UUID.test(eventId)) return undefined;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.state !== undefined) values.state = patch.state;
    if (patch.location !== undefined) values.location = patch.location;
    if (patch.capacity !== undefined) values.capacity = patch.capacity;
    if (timestamps?.startsAt !== undefined) values.startsAt = timestamps.startsAt;
    if (timestamps && "endsAt" in timestamps) values.endsAt = timestamps.endsAt;

    const [row] = await this.db
      .update(events)
      .set(values)
      .where(and(eq(events.guildId, guildId), eq(events.id, eventId)))
      .returning();
    return row ? toEvent(row) : undefined;
  }

  async deleteEvent(guildId: string, eventId: string): Promise<boolean> {
    if (!UUID.test(eventId)) return false;
    const deleted = await this.db
      .delete(events)
      .where(and(eq(events.guildId, guildId), eq(events.id, eventId)))
      .returning({ id: events.id });
    return deleted.length > 0;
  }

  async countRsvps(
    guildId: string,
    eventId: string,
    state?: RsvpState,
  ): Promise<number> {
    const conditions = [eq(eventRsvps.guildId, guildId), eq(eventRsvps.eventId, eventId)];
    if (state) conditions.push(eq(eventRsvps.state, state));
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(eventRsvps)
      .where(and(...conditions));
    return Number(row?.count ?? 0);
  }

  async getRsvp(
    guildId: string,
    eventId: string,
    userId: string,
  ): Promise<EventRsvp | undefined> {
    const [row] = await this.db
      .select()
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.guildId, guildId),
          eq(eventRsvps.eventId, eventId),
          eq(eventRsvps.userId, userId),
        ),
      )
      .limit(1);
    return row ? toRsvp(row) : undefined;
  }

  async listRsvps(
    guildId: string,
    eventId: string,
    filter: EventRsvpFilter = {},
  ): Promise<EventRsvp[]> {
    const conditions = [eq(eventRsvps.guildId, guildId), eq(eventRsvps.eventId, eventId)];
    if (filter.state) conditions.push(eq(eventRsvps.state, filter.state));
    const rows = await this.db
      .select()
      .from(eventRsvps)
      .where(and(...conditions))
      .orderBy(asc(eventRsvps.createdAt))
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));
    return rows.map(toRsvp);
  }

  async upsertRsvp(input: NewEventRsvp): Promise<EventRsvpResult> {
    if (!UUID.test(input.eventId)) throw new Error("Event not found");
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(events)
        .where(and(eq(events.guildId, input.guildId), eq(events.id, input.eventId)))
        .limit(1)
        .for("update");
      if (!event) throw new Error("Event not found");

      const [existing] = await tx
        .select()
        .from(eventRsvps)
        .where(
          and(
            eq(eventRsvps.guildId, input.guildId),
            eq(eventRsvps.eventId, input.eventId),
            eq(eventRsvps.userId, input.userId),
          ),
        )
        .limit(1);

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(eventRsvps)
        .where(
          and(
            eq(eventRsvps.guildId, input.guildId),
            eq(eventRsvps.eventId, input.eventId),
            eq(eventRsvps.state, "going"),
          ),
        );
      const going = Number(countRow?.count ?? 0);

      if (
        input.state === "going" &&
        existing?.state !== "going" &&
        event.capacity !== null &&
        going >= event.capacity
      ) {
        return { ok: false as const, reason: "full" as const, going };
      }

      const [row] = await tx
        .insert(eventRsvps)
        .values({
          guildId: input.guildId,
          eventId: input.eventId,
          userId: input.userId,
          state: input.state,
        })
        .onConflictDoUpdate({
          target: [eventRsvps.eventId, eventRsvps.userId],
          set: { state: input.state, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error("Could not record the RSVP");

      const nextGoing =
        input.state === "going"
          ? existing?.state === "going"
            ? going
            : going + 1
          : existing?.state === "going"
            ? going - 1
            : going;
      return { ok: true as const, rsvp: toRsvp(row), going: nextGoing };
    });
  }

  async markReminded(
    guildId: string,
    eventId: string,
    remindedBy: string,
    at: Date,
  ): Promise<EventDefinition | undefined> {
    if (!UUID.test(eventId)) return undefined;
    const [row] = await this.db
      .update(events)
      .set({
        remindedAt: at,
        remindedBy,
        reminderCount: sql`${events.reminderCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(events.guildId, guildId), eq(events.id, eventId)))
      .returning();
    return row ? toEvent(row) : undefined;
  }
}
