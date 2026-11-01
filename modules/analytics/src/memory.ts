import type {
  AnalyticsCommandBucket,
  AnalyticsCommandStats,
  AnalyticsSnapshot,
  AnalyticsSourceCount,
  AnalyticsStore,
  AnalyticsWindow,
  CommandUsageRecord,
  CommandUsageStatus,
  InviteJoinRecord,
  LogEventRecord,
  ModerationCase,
  TicketRecord,
} from "@keystone/kernel";

/**
 * The records an in-memory deployment already owns. This is a reader interface,
 * not a second store: the composition root supplies the same instances the
 * modules use, so analytics cannot drift from the live data.
 */
export interface AnalyticsMemorySource {
  readonly logs: (guildId: string) => Promise<readonly LogEventRecord[]>;
  readonly cases: (guildId: string) => Promise<readonly ModerationCase[]>;
  readonly invites: (guildId: string) => Promise<readonly InviteJoinRecord[]>;
  readonly tickets: (guildId: string) => Promise<readonly TicketRecord[]>;
  readonly commands: (guildId: string) => Promise<readonly CommandUsageRecord[]>;
}

function inWindow(value: string | undefined, window: AnalyticsWindow): boolean {
  return Boolean(value && value >= window.since && value <= window.until);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function commandStats(rows: readonly CommandUsageRecord[]): AnalyticsCommandStats {
  const buckets = new Map<
    string,
    {
      command: string;
      path: string;
      total: number;
      ok: number;
      blocked: number;
      error: number;
      durations: number[];
    }
  >();

  for (const row of rows) {
    const key = `${row.command}\u0000${row.path}`;
    const bucket = buckets.get(key) ?? {
      command: row.command,
      path: row.path,
      total: 0,
      ok: 0,
      blocked: 0,
      error: 0,
      durations: [],
    };
    bucket.total += 1;
    bucket.durations.push(Math.max(0, row.durationMs));
    const status = row.status as CommandUsageStatus;
    if (status === "ok") bucket.ok += 1;
    else if (status === "blocked") bucket.blocked += 1;
    else bucket.error += 1;
    buckets.set(key, bucket);
  }

  const values = [...buckets.values()];
  const top: AnalyticsCommandBucket[] = values
    .map((row) => ({
      command: row.command,
      path: row.path,
      total: row.total,
      ok: row.ok,
      blocked: row.blocked,
      error: row.error,
      averageLatencyMs: average(row.durations),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.command.localeCompare(b.command) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 10);

  return {
    total: values.reduce((sum, row) => sum + row.total, 0),
    ok: values.reduce((sum, row) => sum + row.ok, 0),
    blocked: values.reduce((sum, row) => sum + row.blocked, 0),
    error: values.reduce((sum, row) => sum + row.error, 0),
    averageLatencyMs: average(rows.map((row) => Math.max(0, row.durationMs))),
    top,
  };
}

/**
 * Local-mode analytics. It aggregates the same records the gateway and command
 * dispatch write, so a live memory-mode number is traceable to a real row even
 * though no SQL database is running.
 */
export class MemoryAnalyticsStore implements AnalyticsStore {
  constructor(private readonly source: AnalyticsMemorySource) {}

  async snapshot(guildId: string, window: AnalyticsWindow): Promise<AnalyticsSnapshot> {
    const [logs, cases, invites, tickets, commands] = await Promise.all([
      this.source.logs(guildId),
      this.source.cases(guildId),
      this.source.invites(guildId),
      this.source.tickets(guildId),
      this.source.commands(guildId),
    ]);

    const windowLogs = logs.filter((row) => inWindow(row.createdAt, window));
    const windowCases = cases.filter((row) => inWindow(row.createdAt, window));
    const windowInvites = invites.filter((row) => inWindow(row.joinedAt, window));
    const windowTickets = tickets.filter((row) => inWindow(row.createdAt, window));
    const windowClosedTickets = tickets.filter((row) => inWindow(row.closedAt, window));
    const windowCommands = commands.filter((row) => inWindow(row.at, window));

    const logged = new Map<string, number>();
    for (const row of windowLogs) logged.set(row.kind, (logged.get(row.kind) ?? 0) + 1);
    const loggedEvents = windowLogs.length;
    const inviteJoins = windowInvites.length;
    const invitesLeft = windowInvites.filter((row) => row.leftAt).length;
    const retained = Math.max(0, inviteJoins - invitesLeft);
    const flagged = windowInvites.filter((row) => row.fakeReasons.length > 0).length;
    const uniqueInviters = new Set(
      windowInvites.flatMap((row) => (row.inviterId ? [row.inviterId] : [])),
    ).size;

    const activeCases = cases.filter((row) =>
      ["pending", "open", "alerted", "appealed"].includes(row.state),
    ).length;
    const contentFilterCases = windowCases.filter((row) => row.rule?.startsWith("automod.")).length;
    const commandsStats = commandStats(windowCommands);

    const ticketOpen = tickets.filter((row) => row.state === "open").length;
    const ticketClaimed = tickets.filter((row) => row.state === "claimed").length;
    const ticketClosed = tickets.filter((row) => row.state === "closed").length;
    const closeDurations = windowClosedTickets
      .filter((row) => row.closedAt)
      .map(
        (row) =>
          (new Date(row.closedAt as string).getTime() - new Date(row.createdAt).getTime()) /
          60_000,
      );
    const slaBreached = windowClosedTickets.filter(
      (row) =>
        row.slaDueAt &&
        row.closedAt &&
        new Date(row.closedAt).getTime() > new Date(row.slaDueAt).getTime(),
    ).length;

    const sources: AnalyticsSourceCount[] = [
      { id: "logging_events", label: "Audit events", rows: loggedEvents },
      { id: "cases", label: "Moderation cases", rows: windowCases.length },
      { id: "invite_joins", label: "Invite joins", rows: inviteJoins },
      { id: "tickets", label: "Tickets", rows: tickets.length },
      { id: "command_usage", label: "Command runs", rows: windowCommands.length },
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
        casesOpened: windowCases.length,
        inviteJoins,
        retainedInvites: retained,
        commandsRun: commandsStats.total,
        openTickets: ticketOpen,
      },
      members: {
        loggedJoins: logged.get("member_join") ?? 0,
        loggedLeaves: logged.get("member_leave") ?? 0,
        inviteJoins,
        leftSince: invitesLeft,
        retained,
        flagged,
        uniqueInviters,
      },
      messages: {
        deleted: logged.get("message_delete") ?? 0,
        edited: logged.get("message_edit") ?? 0,
        contentFilterCases,
      },
      commands: commandsStats,
      tickets: {
        open: ticketOpen,
        claimed: ticketClaimed,
        closed: ticketClosed,
        opened: windowTickets.length,
        closedInWindow: windowClosedTickets.length,
        averageCloseMinutes:
          closeDurations.length > 0
            ? Math.round(
                (closeDurations.reduce((sum, value) => sum + value, 0) /
                  closeDurations.length) *
                  10,
              ) / 10
            : null,
        slaBreached,
      },
    };
  }
}
