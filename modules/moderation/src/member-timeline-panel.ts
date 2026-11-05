import type { V2Component } from "@keystone/kernel";
import { layout } from "@keystone/ui";
import type { MemberTimeline, TimelineSource } from "./member-timeline";

const ICONS: Record<TimelineSource, string> = {
  cases: "🛡️",
  case_events: "📎",
  tickets: "🎫",
  levels: "📈",
  economy_ledger: "🪙",
  invite_joins: "🤝",
  form_submissions: "📝",
  event_rsvps: "📅",
  modmail_threads: "✉️",
  members: "🪪",
};

function unix(at: string): number | undefined {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : undefined;
}

function stamp(at: string): string {
  const seconds = unix(at);
  return seconds ? `<t:${seconds}:R>` : "unknown time";
}

function count(value: number | undefined, noun: string): string | undefined {
  if (value === undefined) return undefined;
  return `${noun} **${value}${value >= 8 ? "+" : ""} open**`;
}

/**
 * One screen for "what happened with this member?".
 *
 * The rows are deliberately source-tagged: a moderator must be able to see that
 * a line came from `tickets` or `modmail_threads`, and the footer must say which
 * stores could not be read at all. A clean-looking panel that silently omits a
 * failed source would be worse than no panel.
 */
export function memberTimelinePanel(timeline: MemberTimeline): V2Component[] {
  const { facts } = timeline;
  return layout((ui) => {
    ui.container({ accentColor: 0x5865f2 }, (box) => {
      box.text(`## <@${facts.userId}> · Member timeline`);

      const summary = [
        facts.level === undefined ? "No level row" : `**Level ${facts.level}**`,
        facts.xp === undefined ? undefined : `${facts.xp.toLocaleString("en-US")} XP`,
        facts.rank === undefined ? undefined : `rank #${facts.rank}`,
        facts.balance === undefined ? undefined : `${facts.balance.toLocaleString("en-US")} coins`,
      ].filter((part): part is string => Boolean(part));
      box.text(summary.join(" · "));

      const membership = [
        facts.joinedAt ? `Joined ${stamp(facts.joinedAt)}` : undefined,
        facts.invitedBy ? `invited by <@${facts.invitedBy}>` : undefined,
        facts.invitesRetained === undefined ? undefined : `${facts.invitesRetained} invites retained`,
        facts.quarantined === true ? "**Quarantined**" : undefined,
        facts.verifiedAt ? `verified ${stamp(facts.verifiedAt)}` : undefined,
      ].filter((part): part is string => Boolean(part));
      if (membership.length > 0) box.text(membership.join(" · "));

      const counters = [
        count(facts.openCases, "Cases"),
        count(facts.openTickets, "Tickets"),
        count(facts.openModmail, "Modmail"),
      ].filter((part): part is string => Boolean(part));
      if (counters.length > 0) box.text(counters.join(" · "));

      box.separator();

      box.text("**Recent activity**");
      if (timeline.entries.length === 0) {
        box.text("-# No activity is recorded in the joined stores.");
      } else {
        box.text(
          timeline.entries
            .map((entry) => {
              const link = entry.link ? ` · [channel](${entry.link})` : "";
              return `• ${ICONS[entry.source]} ${stamp(entry.at)} · ${entry.text}${link} · \`${entry.source}\``;
            })
            .join("\n"),
        );
      }

      box.separator();

      const read = timeline.sources
        .filter((source) => source.state === "ok")
        .map((source) => (source.rows > 0 ? `${source.source} (${source.rows})` : source.source));
      const notWired = timeline.sources
        .filter((source) => source.state === "not-wired")
        .map((source) => source.source);
      const failed = timeline.sources
        .filter((source) => source.state === "failed")
        .map((source) => source.source);
      const footer = [
        `-# Sources read: ${read.length > 0 ? read.join(" · ") : "none"}`,
        notWired.length > 0 ? `-# Not wired: ${notWired.join(", ")}` : undefined,
        failed.length > 0 ? `-# Failed: ${failed.join(", ")}` : undefined,
        timeline.truncated > 0
          ? `-# +${timeline.truncated} older row${timeline.truncated === 1 ? "" : "s"} not shown.`
          : undefined,
        "-# Not joined: logs (no member index), AI labels (advisory only).",
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
      box.text(footer);
    });
  });
}
