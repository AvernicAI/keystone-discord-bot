/**
 * Guild events and RSVPs, structurally.
 *
 * An event is operator-owned configuration with a lifecycle; an RSVP is member
 * state with one row per member. They are separate records behind one store
 * because capacity must be counted from the RSVP rows (never a cached counter)
 * and an RSVP must reference a stable event id, not a settings key.
 */

export type EventState = "draft" | "open" | "closed";
export type RsvpState = "going" | "not_going";

/**
 * `reminded_by` for the reminder the 60-second tick sends.
 *
 * A sentinel rather than a member id: no member pressed anything, and the
 * command renders it as prose instead of a mention that would point at nobody.
 */
export const SCHEDULED_REMINDER_ACTOR = "system";

export interface EventDefinition {
  readonly id: string;
  readonly guildId: string;
  /** Short operator-facing reference used by every subcommand. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly state: EventState;
  /** ISO timestamp; the event starts at this instant. */
  readonly startsAt: string;
  readonly endsAt?: string;
  /** Free-form place: a channel mention, an address, or "voice stage". */
  readonly location: string;
  /** Undefined means unlimited; any number is a hard cap on `going` rows. */
  readonly capacity?: number;
  /**
   * Channel where the interactive panel was posted. The tick has no interaction
   * to reply to, so this row is how a reminder finds its audience.
   */
  readonly panelChannelId?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly remindedAt?: string;
  /** A member id, or `SCHEDULED_REMINDER_ACTOR` for the tick. */
  readonly remindedBy?: string;
  readonly reminderCount: number;
}

export interface NewEvent {
  readonly guildId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly state: EventState;
  readonly startsAt: string;
  readonly endsAt?: string;
  readonly location: string;
  readonly capacity?: number;
  readonly createdBy: string;
}

export type EventCreateResult =
  | { readonly ok: true; readonly event: EventDefinition }
  | { readonly ok: false; readonly reason: "duplicate-key" };

export interface EventPatch {
  readonly name?: string;
  readonly description?: string;
  readonly state?: EventState;
  readonly startsAt?: string;
  readonly endsAt?: string | null;
  readonly location?: string;
  /** `null` clears the cap; `undefined` leaves it unchanged. */
  readonly capacity?: number | null;
}

export interface EventRsvp {
  readonly id: string;
  readonly guildId: string;
  readonly eventId: string;
  /** The member who owns this row; no command can write another member's row. */
  readonly userId: string;
  readonly state: RsvpState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewEventRsvp {
  readonly guildId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly state: RsvpState;
}

export type EventRsvpResult =
  | { readonly ok: true; readonly rsvp: EventRsvp; readonly going: number }
  | { readonly ok: false; readonly reason: "full"; readonly going: number };

export interface EventSummary {
  readonly event: EventDefinition;
  readonly going: number;
  readonly notGoing: number;
}

export interface EventRsvpFilter {
  readonly state?: RsvpState;
  readonly limit?: number;
}

/**
 * The one owner of event state. The capacity check happens inside the store so
 * two concurrent RSVPs cannot both take the last seat; the service only turns
 * the typed result into an accurate refusal.
 */
export interface EventStore {
  createEvent(input: NewEvent): Promise<EventCreateResult>;
  /** Resolve by key or id, always scoped to the guild. */
  getEvent(guildId: string, reference: string): Promise<EventDefinition | undefined>;
  listEvents(guildId: string, limit?: number): Promise<EventDefinition[]>;
  updateEvent(
    guildId: string,
    eventId: string,
    patch: EventPatch,
    /** Set only when the operator explicitly changed the start/end. */
    timestamps?: { startsAt?: Date; endsAt?: Date | null },
  ): Promise<EventDefinition | undefined>;
  /** Deletes the event; callers refuse when RSVPs exist. */
  deleteEvent(guildId: string, eventId: string): Promise<boolean>;
  countRsvps(guildId: string, eventId: string, state?: RsvpState): Promise<number>;
  getRsvp(guildId: string, eventId: string, userId: string): Promise<EventRsvp | undefined>;
  listRsvps(
    guildId: string,
    eventId: string,
    filter?: EventRsvpFilter,
  ): Promise<EventRsvp[]>;
  /** One row per member per event; the capacity check is atomic. */
  upsertRsvp(input: NewEventRsvp): Promise<EventRsvpResult>;
  /** Records who sent the reminder and when; never sends anything itself. */
  markReminded(
    guildId: string,
    eventId: string,
    remindedBy: string,
    at: Date,
  ): Promise<EventDefinition | undefined>;
  /**
   * Record the channel an interactive panel was posted to. A reminder fired by
   * the tick has no interaction to reply to, so the announcement's channel is
   * part of the event row rather than hidden in a second store.
   */
  attachPanel(
    guildId: string,
    eventId: string,
    channelId: string,
  ): Promise<EventDefinition | undefined>;
  /**
   * Atomically claim the one automatic reminder. `undefined` means another tick
   * already claimed it, the event is no longer open, or it does not exist.
   */
  claimReminder(guildId: string, eventId: string, at: Date): Promise<EventDefinition | undefined>;
  /** Release a claim whose delivery failed, so the next tick can retry. */
  releaseReminder(guildId: string, eventId: string): Promise<void>;
}
