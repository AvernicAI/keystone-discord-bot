/**
 * Structural analytics types. No discord.js, no Drizzle, no network.
 *
 * Analytics is a read model over rows the bot already owns: the audit ledger,
 * cases, invite joins, tickets and command usage. The module never invents a
 * number and never writes an analytics event; every field names the store it
 * came from in `sources`.
 */

export type AnalyticsSourceId =
  | "logging_events"
  | "cases"
  | "invite_joins"
  | "tickets"
  | "command_usage";

export interface AnalyticsWindow {
  /** Requested window in days, already bounded by the command. */
  readonly days: number;
  /** Inclusive ISO timestamp used by timestamped sources. */
  readonly since: string;
  /** Inclusive ISO timestamp; also the snapshot's generatedAt. */
  readonly until: string;
}

export interface AnalyticsSourceCount {
  readonly id: AnalyticsSourceId;
  readonly label: string;
  /** Rows the source contributed to this snapshot. */
  readonly rows: number;
}

export interface AnalyticsOverview {
  /** Rows in logging_events in the window. */
  readonly loggedEvents: number;
  /** Cases currently in pending, open, alerted or appealed. */
  readonly activeCases: number;
  /** Cases created in the window. */
  readonly casesOpened: number;
  readonly inviteJoins: number;
  readonly retainedInvites: number;
  readonly commandsRun: number;
  /** Current open tickets, independent of the window. */
  readonly openTickets: number;
}

export interface AnalyticsMemberStats {
  readonly loggedJoins: number;
  readonly loggedLeaves: number;
  readonly inviteJoins: number;
  /** Invite joins in the window whose row has since been marked left. */
  readonly leftSince: number;
  readonly retained: number;
  readonly flagged: number;
  readonly uniqueInviters: number;
}

export interface AnalyticsMessageStats {
  readonly deleted: number;
  readonly edited: number;
  /** Cases in the window with an `automod.*` rule. */
  readonly contentFilterCases: number;
}

export type CommandUsageStatus = "ok" | "blocked" | "error";

export interface CommandUsageInput {
  readonly guildId: string;
  readonly command: string;
  /** Joined subcommand path, or an empty string for a root-only command. */
  readonly path: string;
  readonly status: CommandUsageStatus;
  readonly durationMs: number;
  /** ISO timestamp of the dispatch. */
  readonly at: string;
}

export interface CommandUsageRecord extends CommandUsageInput {
  readonly id: string;
}

/** The narrow write port dispatch needs so `/analytics commands` has real rows. */
export interface CommandUsageStore {
  record(input: CommandUsageInput): Promise<void>;
}

export interface AnalyticsCommandBucket {
  readonly command: string;
  readonly path: string;
  readonly total: number;
  readonly ok: number;
  readonly blocked: number;
  readonly error: number;
  readonly averageLatencyMs: number | null;
}

export interface AnalyticsCommandStats {
  readonly total: number;
  readonly ok: number;
  readonly blocked: number;
  readonly error: number;
  readonly averageLatencyMs: number | null;
  /** Highest-volume first, capped by the store. */
  readonly top: readonly AnalyticsCommandBucket[];
}

export interface AnalyticsTicketStats {
  readonly open: number;
  readonly claimed: number;
  readonly closed: number;
  /** Tickets created in the window. */
  readonly opened: number;
  /** Tickets closed in the window. */
  readonly closedInWindow: number;
  /** Average minutes from creation to close for tickets closed in the window. */
  readonly averageCloseMinutes: number | null;
  /** Tickets closed in the window after their SLA due time. */
  readonly slaBreached: number;
}

export interface AnalyticsSnapshot {
  readonly version: 1;
  readonly guildId: string;
  /** Equal to `window.until`; the store does not read a second clock. */
  readonly generatedAt: string;
  readonly window: AnalyticsWindow;
  readonly sources: readonly AnalyticsSourceCount[];
  readonly overview: AnalyticsOverview;
  readonly members: AnalyticsMemberStats;
  readonly messages: AnalyticsMessageStats;
  readonly commands: AnalyticsCommandStats;
  readonly tickets: AnalyticsTicketStats;
}

export interface AnalyticsStore {
  snapshot(guildId: string, window: AnalyticsWindow): Promise<AnalyticsSnapshot>;
}
