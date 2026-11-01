import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  AnalyticsCommandBucket,
  AnalyticsCommandStats,
  AnalyticsSnapshot,
  AnalyticsSourceCount,
  AnalyticsStore,
  AnalyticsTicketStats,
  AnalyticsWindow,
  CommandUsageStatus,
} from "@keystone/kernel";
import { cases, commandUsage, inviteJoins, loggingEvents, tickets } from "./schema";
import type { schema } from "./schema";

type AnalyticsDb = PgDatabase<any, typeof schema>;

const number = (value: number | string | null | undefined): number => Number(value ?? 0);

interface CommandAccumulator {
  command: string;
  path: string;
  total: number;
  ok: number;
  blocked: number;
  error: number;
  durationMs: number;
}

/**
 * Postgres analytics read model.
 *
 * Every field is an aggregate over a table that already exists. There is no
 * analytics table and no counter to reconcile: the snapshot is a query, which
 * is why the command's numbers can be checked against a raw `count(*)`.
 *
 * Source semantics:
 * - logging_events, cases, invite_joins, command_usage are filtered by the
 *   requested timestamp window.
 * - tickets mixes current state counts with activity in the window; that is
 *   called out in the command and in `AnalyticsTicketStats`.
 */
export class DrizzleAnalyticsStore implements AnalyticsStore {
  constructor(private readonly db: AnalyticsDb) {}

  async snapshot(guildId: string, window: AnalyticsWindow): Promise<AnalyticsSnapshot> {
    const since = new Date(window.since);
    const until = new Date(window.until);

    const [logRows, caseStateRows, caseWindowRows, inviteRows, ticketStateRows, ticketOpenedRows, ticketClosedRows, usageRows] =
      await Promise.all([
        this.db
          .select({ kind: loggingEvents.kind, count: sql<number>`count(*)` })
          .from(loggingEvents)
          .where(
            and(
              eq(loggingEvents.guildId, guildId),
              gte(loggingEvents.createdAt, since),
              lte(loggingEvents.createdAt, until),
            ),
          )
          .groupBy(loggingEvents.kind),
        this.db
          .select({ state: cases.state, count: sql<number>`count(*)` })
          .from(cases)
          .where(eq(cases.guildId, guildId))
          .groupBy(cases.state),
        this.db
          .select({ rule: cases.rule, count: sql<number>`count(*)` })
          .from(cases)
          .where(and(eq(cases.guildId, guildId), gte(cases.createdAt, since), lte(cases.createdAt, until)))
          .groupBy(cases.rule),
        this.db
          .select({
            joins: sql<number>`count(*)`,
            left: sql<number>`count(${inviteJoins.leftAt})`,
            flagged: sql<number>`count(*) filter (where jsonb_array_length(${inviteJoins.fakeReasons}) > 0)`,
            inviters: sql<number>`count(distinct ${inviteJoins.inviterId})`,
          })
          .from(inviteJoins)
          .where(
            and(
              eq(inviteJoins.guildId, guildId),
              gte(inviteJoins.joinedAt, since),
              lte(inviteJoins.joinedAt, until),
            ),
          ),
        this.db
          .select({ state: tickets.state, count: sql<number>`count(*)` })
          .from(tickets)
          .where(eq(tickets.guildId, guildId))
          .groupBy(tickets.state),
        this.db
          .select({ count: sql<number>`count(*)` })
          .from(tickets)
          .where(
            and(
              eq(tickets.guildId, guildId),
              gte(tickets.createdAt, since),
              lte(tickets.createdAt, until),
            ),
          ),
        this.db
          .select({
            count: sql<number>`count(*)`,
            averageMinutes: sql<number | null>`avg(extract(epoch from (${tickets.closedAt} - ${tickets.createdAt})) / 60)`,
            breached: sql<number>`count(*) filter (where ${tickets.slaDueAt} is not null and ${tickets.closedAt} > ${tickets.slaDueAt})`,
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.guildId, guildId),
              gte(tickets.closedAt, since),
              lte(tickets.closedAt, until),
            ),
          ),
        this.db
          .select({
            command: commandUsage.command,
            path: commandUsage.path,
            status: commandUsage.status,
            count: sql<number>`count(*)`,
            durationMs: sql<number>`sum(${commandUsage.durationMs})`,
          })
          .from(commandUsage)
          .where(
            and(
              eq(commandUsage.guildId, guildId),
              gte(commandUsage.createdAt, since),
              lte(commandUsage.createdAt, until),
            ),
          )
          .groupBy(commandUsage.command, commandUsage.path, commandUsage.status),
      ]);

    const logged = new Map<string, number>();
    for (const row of logRows) logged.set(row.kind, number(row.count));
    const loggedEvents = [...logged.values()].reduce((sum, count) => sum + count, 0);

    const caseStates = new Map<string, number>();
    for (const row of caseStateRows) caseStates.set(row.state, number(row.count));
    const casesOpened = caseWindowRows.reduce((sum, row) => sum + number(row.count), 0);
    const contentFilterCases = caseWindowRows
      .filter((row) => row.rule?.startsWith("automod."))
      .reduce((sum, row) => sum + number(row.count), 0);
    const activeCases = [...caseStates.entries()]
      .filter(([state]) => ["pending", "open", "alerted", "appealed"].includes(state))
      .reduce((sum, [, count]) => sum + count, 0);

    const invites = inviteRows[0];
    const inviteJoinsCount = number(invites?.joins);
    const invitesLeft = number(invites?.left);
    const flagged = number(invites?.flagged);
    const uniqueInviters = number(invites?.inviters);

    const ticketStates = new Map<string, number>();
    for (const row of ticketStateRows) ticketStates.set(row.state, number(row.count));
    const ticketOpen = ticketStates.get("open") ?? 0;
    const ticketClaimed = ticketStates.get("claimed") ?? 0;
    const ticketClosed = ticketStates.get("closed") ?? 0;
    const ticketsTotal = [...ticketStates.values()].reduce((sum, count) => sum + count, 0);
    const ticketOpened = number(ticketOpenedRows[0]?.count);
    const ticketClosedWindow = number(ticketClosedRows[0]?.count);
    const averageClose = ticketClosedRows[0]?.averageMinutes;
    const slaBreached = number(ticketClosedRows[0]?.breached);

    const commands = this.#commands(usageRows);
    const ticketsStats: AnalyticsTicketStats = {
      open: ticketOpen,
      claimed: ticketClaimed,
      closed: ticketClosed,
      opened: ticketOpened,
      closedInWindow: ticketClosedWindow,
      averageCloseMinutes:
        ticketClosedWindow > 0 && averageClose !== null
          ? Math.round(Number(averageClose) * 10) / 10
          : null,
      slaBreached,
    };

    const sources: AnalyticsSourceCount[] = [
      { id: "logging_events", label: "Audit events", rows: loggedEvents },
      { id: "cases", label: "Moderation cases", rows: casesOpened },
      { id: "invite_joins", label: "Invite joins", rows: inviteJoinsCount },
      { id: "tickets", label: "Tickets", rows: ticketsTotal },
      { id: "command_usage", label: "Command runs", rows: commands.total },
    ];

    return {
      version: 1,
      guildId,
      generatedAt: window.until,
      window,
      sources,
      overview: {
        loggedEvents,
        activeCases,
        casesOpened,
        inviteJoins: inviteJoinsCount,
        retainedInvites: Math.max(0, inviteJoinsCount - invitesLeft),
        commandsRun: commands.total,
        openTickets: ticketOpen,
      },
      members: {
        loggedJoins: logged.get("member_join") ?? 0,
        loggedLeaves: logged.get("member_leave") ?? 0,
        inviteJoins: inviteJoinsCount,
        leftSince: invitesLeft,
        retained: Math.max(0, inviteJoinsCount - invitesLeft),
        flagged,
        uniqueInviters,
      },
      messages: {
        deleted: logged.get("message_delete") ?? 0,
        edited: logged.get("message_edit") ?? 0,
        contentFilterCases,
      },
      commands,
      tickets: ticketsStats,
    };
  }

  #commands(
    rows: { command: string; path: string; status: string; count: number; durationMs: number }[],
  ): AnalyticsCommandStats {
    const buckets = new Map<string, CommandAccumulator>();
    for (const row of rows) {
      const key = `${row.command}\u0000${row.path}`;
      const bucket = buckets.get(key) ?? {
        command: row.command,
        path: row.path,
        total: 0,
        ok: 0,
        blocked: 0,
        error: 0,
        durationMs: 0,
      };
      const count = number(row.count);
      bucket.total += count;
      bucket.durationMs += number(row.durationMs);
      const status = row.status as CommandUsageStatus;
      if (status === "ok") bucket.ok += count;
      else if (status === "blocked") bucket.blocked += count;
      else bucket.error += count;
      buckets.set(key, bucket);
    }

    const values = [...buckets.values()];
    const total = values.reduce((sum, row) => sum + row.total, 0);
    const duration = values.reduce((sum, row) => sum + row.durationMs, 0);
    const top: AnalyticsCommandBucket[] = values
      .map((row) => ({
        command: row.command,
        path: row.path,
        total: row.total,
        ok: row.ok,
        blocked: row.blocked,
        error: row.error,
        averageLatencyMs: row.total > 0 ? Math.round(row.durationMs / row.total) : null,
      }))
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.command.localeCompare(b.command) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 10);

    return {
      total,
      ok: values.reduce((sum, row) => sum + row.ok, 0),
      blocked: values.reduce((sum, row) => sum + row.blocked, 0),
      error: values.reduce((sum, row) => sum + row.error, 0),
      averageLatencyMs: total > 0 ? Math.round(duration / total) : null,
      top,
    };
  }
}
