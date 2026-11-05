import type { V2Button } from "@keystone/kernel";
import { LayoutError, type Box, type Ui } from "./layout";

/**
 * The panel grammar: six primitives every Keystone surface uses.
 *
 * They exist because Discord gives a bot almost nothing — a heading, tiny
 * subtext, a separator, a row and a button — so consistency *is* the design.
 * Each primitive owns one rule that is easy to get wrong by hand:
 *
 * - `heading` always pairs a title with a context line, so no screen opens with
 *   a bare title that does not say whose data it is showing.
 * - `facts` keeps a summary to one scannable line instead of a paragraph.
 * - `rows` caps the list and every row, so no panel becomes a wall.
 * - `emptyState` always offers the next action, so no screen is a dead end.
 * - `footer` renders provenance as tiny text, never as a second paragraph.
 * - `actionRow` allows one primary button, because a row of five primaries is
 *   the same as no recommendation.
 *
 * Caps throw for programmer error (an empty title) and clip for data (a long
 * ticket subject). A test can therefore assert the shape, while a guild with an
 * absurd display name can never make a panel fail to render.
 */

export const MAX_HEADING_TITLE = 80;
export const MAX_CONTEXT = 120;
export const MAX_FACT_PARTS = 5;
export const MAX_FACT_PART = 80;
export const MAX_ROWS = 12;
export const MAX_ROW = 200;
export const MAX_FOOTER_LINES = 3;
export const MAX_ACTIONS = 3;
export const ELLIPSIS = "…";

/** Collapse newlines and runs of spaces; a one-line slot must stay one line. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function clip(value: string, limit: number): string {
  const line = oneLine(value);
  return line.length > limit ? `${line.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}` : line;
}

export interface HeadingInput {
  readonly glyph: string;
  readonly title: string;
  /** What this screen is, for whom, and in which scope. */
  readonly context?: string;
}

/**
 * `## 🧭 Title` plus one tiny context line. The context is not decoration: it
 * is where a panel says "member timeline · this server" so a screenshot of a
 * panel cannot be mistaken for another guild's data.
 */
export function heading(input: HeadingInput): string {
  const title = oneLine(input.title);
  if (!title) throw new LayoutError("a heading needs a non-empty title");
  if (title.length > MAX_HEADING_TITLE) {
    throw new LayoutError(
      `a heading title is at most ${MAX_HEADING_TITLE} characters; got ${title.length}`,
    );
  }
  const first = `## ${input.glyph} ${title}`.trim();
  const context = input.context ? clip(input.context, MAX_CONTEXT) : "";
  return context ? `${first}\n-# ${context}` : first;
}

/**
 * One summary line. Empty and undefined parts disappear, so a caller can pass
 * every optional fact without branching; five is the cap because six facts on
 * one line stop being readable.
 */
export function facts(parts: readonly (string | undefined)[]): string | undefined {
  const kept = parts
    .filter((part): part is string => typeof part === "string" && oneLine(part).length > 0)
    .slice(0, MAX_FACT_PARTS)
    .map((part) => clip(part, MAX_FACT_PART));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

export interface RowInput {
  readonly at?: number;
  readonly text: string;
  /** The table the row came from; rendered in inline code. */
  readonly source?: string;
  readonly link?: string;
}

/**
 * `• <t:…:R> · text · \`source\``. The source tag is the honesty the big bots
 * do not show: a moderator can see whether a line came from cases or modmail
 * without opening another command.
 */
export function row(input: RowInput): string {
  const text = clip(input.text, MAX_ROW);
  const parts = [
    input.at ? `<t:${input.at}:R>` : undefined,
    text,
    input.link ? `[channel](${input.link})` : undefined,
    input.source ? `\`${input.source}\`` : undefined,
  ].filter((part): part is string => Boolean(part));
  return `• ${parts.join(" · ")}`;
}

/** Cap a list of prepared rows; returns the prepared block and how many hid. */
export function rows(list: readonly string[], limit = MAX_ROWS): {
  readonly block: string;
  readonly hidden: number;
} {
  const visible = list.slice(0, Math.max(0, limit));
  return {
    block: visible.join("\n"),
    hidden: Math.max(0, list.length - visible.length),
  };
}

/**
 * The fact and the next move. A member with no history is not a bug, but a
 * blank panel is: this is always two tiny lines, and the second one names a
 * command the reader can actually run.
 */
export function emptyState(input: { readonly fact: string; readonly next?: string }): string {
  const lines = [`-# ${clip(input.fact, MAX_ROW)}`];
  if (input.next) lines.push(`-# ${clip(input.next, MAX_ROW)}`);
  return lines.join("\n");
}

/** Tiny provenance lines; empty entries drop out and three is the cap. */
export function footer(parts: readonly (string | undefined)[]): string {
  const kept = parts
    .filter((part): part is string => typeof part === "string" && oneLine(part).length > 0)
    .slice(0, MAX_FOOTER_LINES)
    .map((part) => `-# ${clip(part, MAX_ROW)}`);
  return kept.join("\n");
}

/**
 * `Read <t:…:R> · scope`, without the `-#` prefix: it is a footer line, and
 * `footer` owns the prefix. A timestamp is what makes a refresh honest — the
 * reader can tell a fresh panel from one that has been open for an hour.
 */
export function readStamp(nowMs: number, scope?: string): string {
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new LayoutError(`a read stamp needs a finite, positive time; got ${nowMs}`);
  }
  const at = Math.floor(nowMs / 1_000);
  const base = `Read <t:${at}:R>`;
  return scope ? `${base} · ${clip(scope, MAX_CONTEXT)}` : base;
}

export interface ActionButton {
  readonly label: string;
  readonly variant: "primary" | "secondary" | "link";
  readonly customId?: string;
  readonly url?: string;
}

/**
 * One action row, at most three buttons, at most one primary. Secondary is for
 * moving between views; link is for leaving Discord. A row that breaks these
 * rules is a design bug, so it throws instead of rendering a wall of buttons.
 */
export function actionRow(box: Box, ui: Ui, buttons: readonly ActionButton[]): void {
  if (buttons.length === 0 || buttons.length > MAX_ACTIONS) {
    throw new LayoutError(`an action row holds 1-${MAX_ACTIONS} buttons; got ${buttons.length}`);
  }
  if (buttons.filter((button) => button.variant === "primary").length > 1) {
    throw new LayoutError("an action row holds at most one primary button");
  }
  const built: V2Button[] = buttons.map((button) => {
    if (button.variant === "link") {
      if (!button.url) throw new LayoutError(`a link button needs a url: ${button.label}`);
      if (button.customId) {
        throw new LayoutError(`a link button cannot carry a custom id: ${button.label}`);
      }
      return ui.button({ style: "link", label: button.label, url: button.url });
    }
    if (!button.customId) {
      throw new LayoutError(`a ${button.variant} button needs a custom id: ${button.label}`);
    }
    return ui.button({
      style: button.variant,
      label: button.label,
      customId: button.customId,
    });
  });
  box.actions(built);
}
