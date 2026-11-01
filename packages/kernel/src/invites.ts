/**
 * Structural invite-tracking types. No discord.js, no Drizzle, no network.
 *
 * Invite attribution is a diff problem, not a lookup: Discord increments the
 * `uses` counter of the invite that was redeemed, so the gateway adapter caches
 * the guild's invites and the service compares before/after. Everything that
 * decides *what the numbers mean* lives here and in `modules/invites`.
 */

export interface InviteSource {
  readonly code: string;
  readonly uses: number;
  readonly inviterId?: string;
}

export interface InviteAttribution {
  readonly code: string;
  readonly inviterId: string;
  readonly usesBefore: number;
  readonly usesAfter: number;
}

export interface InviteJoinInput {
  readonly guildId: string;
  readonly userId: string;
  /** Absent when the member joined by vanity URL, a bot invite, or an unknown code. */
  readonly inviterId?: string;
  readonly code?: string;
  /** ISO timestamp from the gateway, used as part of the idempotency key. */
  readonly joinedAt: string;
  readonly fakeReasons?: readonly string[];
}

export interface InviteJoinRecord {
  readonly guildId: string;
  readonly userId: string;
  readonly inviterId?: string;
  readonly code?: string;
  readonly joinedAt: string;
  readonly leftAt?: string;
  readonly fakeReasons: readonly string[];
}

/** Per-inviter totals. `retained` is joins minus leaves, never below zero. */
export interface InviteLeaderboardRow {
  readonly inviterId: string;
  readonly joins: number;
  readonly leaves: number;
  readonly retained: number;
}

export interface InviteStore {
  /** True only when a new row was written; a duplicate delivery returns false. */
  recordJoin(input: InviteJoinInput): Promise<boolean>;
  /** Marks the newest still-present join for the member as left. */
  recordLeave(guildId: string, userId: string, leftAt: string): Promise<boolean>;
  leaderboard(guildId: string, limit: number): Promise<InviteLeaderboardRow[]>;
  statsFor(guildId: string, inviterId: string): Promise<InviteLeaderboardRow | undefined>;
  /** The latest attributed join for a member, for "who invited me". */
  invitee(guildId: string, userId: string): Promise<InviteJoinRecord | undefined>;
}

export interface InviteNotice {
  content?: string;
  embeds?: import("./types").EmbedPayload[];
}

/** The narrow side effect the module needs: one log-channel alert. */
export interface InviteActions {
  notify(guildId: string, channelId: string, notice: InviteNotice): Promise<void>;
}

export interface InvitePort {
  readonly store: InviteStore;
  readonly actions: InviteActions;
}
