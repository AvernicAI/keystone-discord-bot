import type { AnalyticsSnapshot, EmbedPayload } from "@keystone/kernel";

export interface AnalyticsView {
  readonly content: string;
  readonly embed: EmbedPayload;
}

function windowLabel(snapshot: AnalyticsSnapshot): string {
  return `${snapshot.window.days}d · ${snapshot.window.since.slice(0, 10)} → ${snapshot.window.until.slice(0, 10)}`;
}

function sourceLine(snapshot: AnalyticsSnapshot): string {
  return snapshot.sources.map((source) => `${source.id} (${source.rows})`).join(" · ");
}

function embed(snapshot: AnalyticsSnapshot, title: string, fields: { name: string; value: string; inline?: boolean }[], description?: string): EmbedPayload {
  return {
    title,
    description,
    color: 0x5865f2,
    fields: [
      ...fields,
      { name: "Source rows", value: sourceLine(snapshot), inline: false },
    ],
    footer: { text: `Window ${windowLabel(snapshot)} · counts are rows, not estimates` },
    timestamp: snapshot.generatedAt,
  };
}

export function overviewView(snapshot: AnalyticsSnapshot): AnalyticsView {
  const { overview } = snapshot;
  return {
    content: `Analytics overview · ${snapshot.window.days}d · ${overview.commandsRun} command runs · ${overview.loggedEvents} logged events · ${overview.activeCases} active cases · ${overview.openTickets} open tickets`,
    embed: embed(snapshot, "Analytics overview", [
      { name: "Logged events", value: String(overview.loggedEvents), inline: true },
      { name: "Active cases", value: `${overview.activeCases} (${overview.casesOpened} opened)`, inline: true },
      { name: "Invites", value: `${overview.inviteJoins} joins · ${overview.retainedInvites} retained`, inline: true },
      { name: "Command runs", value: String(overview.commandsRun), inline: true },
      { name: "Open tickets", value: String(overview.openTickets), inline: true },
      { name: "Window", value: windowLabel(snapshot), inline: true },
    ], "Read-only aggregate over the bot's own ledgers. Open tickets and active cases are current state; the other counts use the window."),
  };
}

export function membersView(snapshot: AnalyticsSnapshot): AnalyticsView {
  const { members } = snapshot;
  return {
    content: `Analytics members · ${snapshot.window.days}d · ${members.loggedJoins} logged joins · ${members.loggedLeaves} logged leaves · ${members.inviteJoins} invite joins · ${members.retained} retained · ${members.flagged} flagged`,
    embed: embed(snapshot, "Member analytics", [
      { name: "Logged joins", value: String(members.loggedJoins), inline: true },
      { name: "Logged leaves", value: String(members.loggedLeaves), inline: true },
      { name: "Invite joins", value: String(members.inviteJoins), inline: true },
      { name: "Left since", value: String(members.leftSince), inline: true },
      { name: "Retained", value: String(members.retained), inline: true },
      { name: "Flagged joins", value: String(members.flagged), inline: true },
      { name: "Unique inviters", value: String(members.uniqueInviters), inline: true },
    ], "Logged joins and leaves come from audit logging. Invite joins come from invite_joins; flags are advisory findings, never punishments."),
  };
}

export function messagesView(snapshot: AnalyticsSnapshot): AnalyticsView {
  const { messages } = snapshot;
  return {
    content: `Analytics messages · ${snapshot.window.days}d · ${messages.deleted} deleted · ${messages.edited} edited · ${messages.contentFilterCases} content-filter cases`,
    embed: embed(snapshot, "Message analytics", [
      { name: "Deleted", value: String(messages.deleted), inline: true },
      { name: "Edited", value: String(messages.edited), inline: true },
      { name: "Content-filter cases", value: String(messages.contentFilterCases), inline: true },
    ], "This counts events captured by /logging, not every message sent. Enable logging and the relevant event toggles for coverage; message content is not included in this view."),
  };
}

export function commandsView(snapshot: AnalyticsSnapshot): AnalyticsView {
  const { commands } = snapshot;
  const top = commands.top
    .map((row) => {
      const name = row.path ? `/${row.command} ${row.path}` : `/${row.command}`;
      return `\`${name}\` — ${row.total} runs · ${row.ok} ok · ${row.blocked} blocked · ${row.error} error${row.averageLatencyMs === null ? "" : ` · ${row.averageLatencyMs}ms`}`;
    })
    .join("\n");
  return {
    content: `Analytics commands · ${snapshot.window.days}d · ${commands.total} runs · ${commands.ok} ok · ${commands.blocked} blocked · ${commands.error} error · avg ${commands.averageLatencyMs ?? "n/a"}ms`,
    embed: embed(snapshot, "Command analytics", [
      { name: "Runs", value: String(commands.total), inline: true },
      { name: "Ok", value: String(commands.ok), inline: true },
      { name: "Blocked", value: String(commands.blocked), inline: true },
      { name: "Error", value: String(commands.error), inline: true },
      { name: "Average latency", value: commands.averageLatencyMs === null ? "n/a" : `${commands.averageLatencyMs}ms`, inline: true },
    ], top || "No command runs recorded in this window."),
  };
}

export function ticketsView(snapshot: AnalyticsSnapshot): AnalyticsView {
  const { tickets } = snapshot;
  return {
    content: `Analytics tickets · ${snapshot.window.days}d · ${tickets.open} open · ${tickets.claimed} claimed · ${tickets.closed} closed · ${tickets.opened} opened · ${tickets.closedInWindow} closed in window · ${tickets.averageCloseMinutes ?? "n/a"} min avg`,
    embed: embed(snapshot, "Ticket analytics", [
      { name: "Open", value: String(tickets.open), inline: true },
      { name: "Claimed", value: String(tickets.claimed), inline: true },
      { name: "Closed", value: String(tickets.closed), inline: true },
      { name: "Opened in window", value: String(tickets.opened), inline: true },
      { name: "Closed in window", value: String(tickets.closedInWindow), inline: true },
      { name: "Average close", value: tickets.averageCloseMinutes === null ? "n/a" : `${tickets.averageCloseMinutes} min`, inline: true },
      { name: "SLA breached", value: String(tickets.slaBreached), inline: true },
    ], "Open, claimed and closed are current state. Opened, closed and average close use the window; SLA breached means closed after the recorded SLA due time."),
  };
}

export function exportView(snapshot: AnalyticsSnapshot): AnalyticsView {
  let json = JSON.stringify(snapshot);
  if (json.length > 3_850) {
    json = JSON.stringify({
      ...snapshot,
      commands: { ...snapshot.commands, top: [] },
      truncated: true,
    });
  }
  return {
    content: `Analytics export · ${snapshot.window.days}d · JSON is in the embed.`,
    embed: {
      title: "Analytics export",
      description: `\`\`\`json\n${json}\n\`\`\``.slice(0, 4_096),
      color: 0x5865f2,
      footer: { text: "Read-only snapshot; no message content, tokens or secrets are included." },
      timestamp: snapshot.generatedAt,
    },
  };
}
