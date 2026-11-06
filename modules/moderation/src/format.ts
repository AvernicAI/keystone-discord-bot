import type { CaseEvent, ModerationCase, V2Component } from "@keystone/kernel";
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

/**
 * One case rendering used by /mod, security alerts, the review queue and appeals.
 *
 * A case is not a data dump. It is three things a moderator reads in order: what
 * happened (action, state, target, rule), why (the reason), and what can be done
 * next (appeal or verify). That is exactly the shape of the shared grammar —
 * heading, one facts line, a section, a footer with the read stamp, one action
 * row — so the panel is built from it instead of from a field wall.
 *
 * Two rules survive from the embed version: the state is named in text, not only
 * in the accent colour, and the footer says the events are append-only. A
 * screenshot cannot show the difference between "closed" and "reversed" if the
 * only signal is a colour.
 */

const STATE_ACCENT: Record<string, number> = {
  pending: ACCENTS.attention,
  open: ACCENTS.attention,
  alerted: ACCENTS.attention,
  appealed: ACCENTS.attention,
  reviewed: ACCENTS.brand,
  reversed: ACCENTS.muted,
  closed: ACCENTS.muted,
};

/** Accent for a case, before a security alert overrides it with dry-run/live. */
export function caseAccent(record: ModerationCase): number {
  return STATE_ACCENT[record.state] ?? ACCENTS.brand;
}

function unix(at: string): number | undefined {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : undefined;
}

/**
 * A reason is bounded at the command, but an imported or synthesised case is
 * not. `layout` throws past its text budget, so the panel clips here instead of
 * turning one long reason into a card nobody can read.
 */
const MAX_REASON = 1_500;

function reasonText(reason: string): string {
  const trimmed = reason.trim() || "No reason was recorded.";
  return trimmed.length > MAX_REASON ? `${trimmed.slice(0, MAX_REASON - 1)}…` : trimmed;
}

/** The one line above the reason: who, by whom, and when it ends. */
function caseFacts(record: ModerationCase): string | undefined {
  const expires = record.expiresAt ? unix(record.expiresAt) : undefined;
  return facts([
    `Target <@${record.targetId}>`,
    record.actorId ? `Actor <@${record.actorId}>` : "Actor not recorded",
    `State **${record.state}**`,
    expires ? `Expires <t:${expires}:R>` : undefined,
  ]);
}

export interface CasePanelOptions {
  /** Signed `appeal:open` id; without one the card has no appeal control. */
  readonly appealId?: string;
  /** Signed `verify:complete` id for a join-gate case. */
  readonly verifyId?: string;
  /** Overrides the default `Case #N` heading title. */
  readonly title?: string;
  /** Overrides the `this server · rule …` context line. */
  readonly context?: string;
  /** Overrides the state-derived accent (a security alert uses danger/attention). */
  readonly accent?: number;
  /** Adds the dry-run sentence; a preview must never look like an enforcement. */
  readonly dryRun?: boolean;
  /** Replaces the appeal hint, e.g. with the outcome of the action this card reports. */
  readonly note?: string;
  /** Injected so the read stamp is deterministic in a test. */
  readonly readAt?: number;
}

/**
 * One case as a signed card. The appeal button lives inside the card rather
 * than beside it, so a forwarded screenshot can never separate the record from
 * the action it offers.
 */
export function casePanel(
  record: ModerationCase,
  options: CasePanelOptions = {},
): V2Component[] {
  const readAt = options.readAt ?? Date.now();
  const appealId = options.appealId;
  const verifyId = options.verifyId;
  const summary = caseFacts(record);
  const reason = reasonText(record.reason);

  return layout((ui) => {
    ui.container({ accentColor: options.accent ?? caseAccent(record) }, (box) => {
      box.text(
        heading({
          glyph: GLYPHS.shield,
          title: options.title ?? `Case #${record.caseNumber} · ${record.action}`,
          context: options.context ?? `this server · rule ${record.rule ?? "manual"}`,
        }),
      );
      if (summary) box.text(summary);

      box.separator({ spacing: "small" });
      box.text(`**Reason**\n${reason}`);

      box.text(
        footer([
          readStamp(readAt, `case #${record.caseNumber} · events are append-only`),
          options.note ??
            (options.dryRun
              ? "Dry run: no punitive action was taken."
              : "Appeal with `/appeal open` or the button below."),
          record.expiresAt ? "The expiry is a scheduled release, not a second case." : undefined,
        ]),
      );

      if (appealId || verifyId) {
        // One primary at most: the join gate is the intended next action when it
        // is present, so the appeal steps down to secondary.
        const buttons = [
          ...(verifyId
            ? [{ label: "✅ Verify and join", variant: "primary" as const, customId: verifyId }]
            : []),
          ...(appealId
            ? [
                {
                  label: "⚖ Appeal this case",
                  variant: verifyId ? ("secondary" as const) : ("primary" as const),
                  customId: appealId,
                },
              ]
            : []),
        ];
        actionRow(box, ui, buttons);
      }
    });
  });
}

export interface CaseListOptions {
  /** Injected so the read stamp is deterministic in a test. */
  readonly readAt?: number;
  /** Shown when there is nothing to list. */
  readonly emptyNext?: string;
}

/**
 * The newest cases as rows instead of paragraphs. The list is a read: it names
 * its source table on every row and it caps itself rather than becoming a wall.
 */
export function caseListPanel(
  records: readonly ModerationCase[],
  title: string,
  options: CaseListOptions = {},
): V2Component[] {
  const readAt = options.readAt ?? Date.now();
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.state, (counts.get(record.state) ?? 0) + 1);
  const countLine = facts(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([state, count]) => `${state} **${count}**`),
  );

  const listed = rows(
    records.map((record) =>
      row({
        at: unix(record.createdAt),
        text: `#${record.caseNumber} · ${record.action} · <@${record.targetId}> · **${record.state}** · ${record.reason}`,
        source: "cases",
      }),
    ),
  );
  const hidden = listed.hidden;

  return layout((ui) => {
    ui.container({ accentColor: ACCENTS.brand }, (box) => {
      box.text(
        heading({
          glyph: GLYPHS.shield,
          title,
          context: `this server · newest first${records.length > 0 ? ` · ${records.length} shown` : ""}`,
        }),
      );

      if (records.length > 0 && countLine) {
        box.text(countLine);
        box.separator({ spacing: "small" });
        box.text(`${listed.block}${hidden > 0 ? `\n-# +${hidden} older not shown.` : ""}`);
      } else {
        box.text(
          emptyState({
            fact: "No cases matched this read.",
            next:
              options.emptyNext ??
              "Open the first one with `/mod warn user:@member reason:…`; it becomes a case immediately.",
          }),
        );
      }

      box.text(
        footer([
          readStamp(readAt, "cases are append-only"),
          "Use `/mod case` for one record with every event.",
        ]),
      );
    });
  });
}

export interface AppealStatusEntry {
  readonly record: ModerationCase;
  readonly appeals: readonly CaseEvent[];
}

function appealMessage(event: CaseEvent): string {
  const data = event.data as { message?: unknown } | undefined;
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  return message.length > 0 ? message.slice(0, 300) : "No message was included.";
}

/**
 * Appeal status is rendered from append-only `appealed` events, not from a
 * current state alone. A review may change the case state; it cannot erase the
 * fact that the member appealed, and the panel says so in its footer.
 */
export function appealStatusPanel(
  entries: readonly AppealStatusEntry[],
  title = "Your appeals",
  options: { readonly readAt?: number } = {},
): V2Component[] {
  const readAt = options.readAt ?? Date.now();
  const listed = rows(
    entries.slice(0, 12).map((entry) => {
      const latest = entry.appeals[entry.appeals.length - 1];
      return row({
        at: latest ? unix(latest.createdAt) : undefined,
        text: `#${entry.record.caseNumber} · ${entry.record.action} · **${entry.record.state}** · ${entry.appeals.length} appeal${entry.appeals.length === 1 ? "" : "s"} · ${latest ? appealMessage(latest) : "No appeal event on record."}`,
        source: "case_events",
      });
    }),
  );

  return layout((ui) => {
    ui.container({ accentColor: entries.length > 0 ? ACCENTS.brand : ACCENTS.muted }, (box) => {
      box.text(
        heading({
          glyph: GLYPHS.shield,
          title,
          context: `your cases · this server${entries.length > 0 ? ` · ${entries.length} with an appeal` : ""}`,
        }),
      );

      if (entries.length === 0) {
        box.text(
          emptyState({
            fact: "No appeal events are on record for you.",
            next: "Use `/appeal open case:<number>` to appeal a case against you.",
          }),
        );
      } else {
        box.separator({ spacing: "small" });
        box.text(`${listed.block}${listed.hidden > 0 ? `\n-# +${listed.hidden} more not shown.` : ""}`);
      }

      box.text(
        footer([
          readStamp(readAt, "read from the appeal events, not the state"),
          "A case state may change after review; the event cannot.",
        ]),
      );
    });
  });
}
