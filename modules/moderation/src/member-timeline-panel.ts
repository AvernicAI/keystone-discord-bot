import type { PanelSigner, V2Component } from "@keystone/kernel";
import {
  ACCENTS,
  GLYPHS,
  actionRow,
  emptyState,
  facts,
  footer,
  heading,
  layout,
  readStamp,
  row,
  rows,
} from "@keystone/ui";
import type { MemberTimeline, TimelineSource } from "./member-timeline";

/**
 * A refresh id outlives a single click, but not a review session. Thirty
 * minutes is long enough for a moderator to open a case, refresh and read the
 * row; short enough that a leaked screenshot's button is already dead.
 */
export const TIMELINE_PANEL_TTL_MS = 30 * 60_000;

/**
 * The payload is just the member id: the interaction already carries the guild,
 * and the router refuses a click from another server before this handler runs.
 * That keeps the id far inside the signer's 40-character payload budget instead
 * of packing two snowflakes into it.
 */
export function timelineRefreshCustomId(
  userId: string,
  signer: PanelSigner,
  now = Date.now(),
): string {
  return signer.sign(
    { namespace: "timeline", action: "refresh", payload: userId, ttlMs: TIMELINE_PANEL_TTL_MS },
    now,
  );
}

const ICONS: Record<TimelineSource, string> = {
  cases: GLYPHS.shield,
  case_events: GLYPHS.shield,
  tickets: GLYPHS.ticket,
  levels: GLYPHS.levels,
  economy_ledger: GLYPHS.economy,
  invite_joins: GLYPHS.invites,
  form_submissions: GLYPHS.forms,
  event_rsvps: GLYPHS.events,
  modmail_threads: GLYPHS.modmail,
  members: GLYPHS.member,
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

export interface MemberTimelinePanelOptions {
  /** Signed `timeline:refresh` id; without one the panel is read-only. */
  readonly refreshId?: string;
  /** Injected so the read stamp is deterministic in a test. */
  readonly readAt?: number;
}

/**
 * One screen for "what happened with this member?".
 *
 * The panel is built from the shared grammar, not from hand-written markdown,
 * so it has the same header, facts, section, footer and action rhythm as every
 * other Keystone surface. Two rules survive from the first version because they
 * are the point of the screen: every row names its source table, and a store
 * that failed is named instead of rendered as "no activity".
 */
export function memberTimelinePanel(
  timeline: MemberTimeline,
  options: MemberTimelinePanelOptions = {},
): V2Component[] {
  const { facts: factsRecord } = timeline;
  const readAt = options.readAt ?? Date.now();

  const summary = facts([
    factsRecord.level === undefined ? "Level not recorded" : `**Level ${factsRecord.level}**`,
    factsRecord.xp === undefined ? undefined : `${factsRecord.xp.toLocaleString("en-US")} XP`,
    factsRecord.rank === undefined ? undefined : `rank #${factsRecord.rank}`,
    factsRecord.balance === undefined
      ? undefined
      : `${factsRecord.balance.toLocaleString("en-US")} coins`,
  ]);

  const membership = facts([
    factsRecord.joinedAt ? `Joined ${stamp(factsRecord.joinedAt)}` : undefined,
    factsRecord.invitedBy ? `invited by <@${factsRecord.invitedBy}>` : undefined,
    factsRecord.invitesRetained === undefined
      ? undefined
      : `${factsRecord.invitesRetained} invites retained`,
    factsRecord.quarantined === true ? "**Quarantined**" : undefined,
    factsRecord.verifiedAt ? `verified ${stamp(factsRecord.verifiedAt)}` : undefined,
  ]);

  const counters = facts([
    count(factsRecord.openCases, "Cases"),
    count(factsRecord.openTickets, "Tickets"),
    count(factsRecord.openModmail, "Modmail"),
  ]);

  const activity = rows(
    timeline.entries.map((entry) =>
      row({
        at: unix(entry.at),
        text: `${ICONS[entry.source]} ${entry.text}`,
        source: entry.source,
        link: entry.link,
      }),
    ),
  );

  const wired = timeline.sources.filter((source) => source.state === "ok");
  const seen = wired
    .filter((source) => source.rows > 0)
    .map((source) => `${source.source} ${source.rows}`);
  const failed = timeline.sources.filter((source) => source.state === "failed");
  const notWired = timeline.sources.filter((source) => source.state === "not-wired");
  const problems = [
    failed.length > 0 ? `Failed: ${failed.map((source) => source.source).join(", ")}` : undefined,
    notWired.length > 0
      ? `Not wired: ${notWired.map((source) => source.source).join(", ")}`
      : undefined,
    "Not joined: logs (no member index), AI labels (advisory only).",
  ].filter((part): part is string => Boolean(part));

  return layout((ui) => {
    ui.container(
      { accentColor: factsRecord.quarantined === true ? ACCENTS.attention : ACCENTS.brand },
      (box) => {
        box.text(
          heading({
            glyph: GLYPHS.timeline,
            title: `<@${factsRecord.userId}> · Member timeline`,
            context: "this server · events from every module",
          }),
        );

        if (summary) box.text(summary);
        if (membership) box.text(membership);
        if (counters) box.text(counters);

        box.separator({ spacing: "small" });
        box.text("**Recent activity**");

        // The count belongs to the list, not to the footer: the service already
        // cut rows at its own cap, so hiding the total would understate what a
        // moderator cannot see. It stays inside the same text display because
        // a container holds ten children and the action row is the tenth.
        const hidden = activity.hidden + timeline.truncated;
        const hiddenNote =
          hidden > 0 ? `\n-# +${hidden} older row${hidden === 1 ? "" : "s"} not shown.` : "";
        box.text(
          (timeline.entries.length === 0
            ? emptyState({
                fact: "No activity is recorded in the joined stores.",
                next: "Run /mod warn user:@member reason:… to open the first case; tickets, forms, RSVPs and invites land here too.",
              })
            : activity.block) + hiddenNote,
        );

        box.separator({ spacing: "small" });
        box.text(
          footer([
            readStamp(readAt, `${wired.length}/${timeline.sources.length} stores joined`),
            seen.length > 0 ? `Rows: ${seen.join(" · ")}` : "Rows: none in the joined stores",
            problems.join(" · "),
          ]),
        );

        if (options.refreshId) {
          actionRow(box, ui, [
            { label: "↻ Refresh", variant: "secondary", customId: options.refreshId },
          ]);
        }
      },
    );
  });
}
