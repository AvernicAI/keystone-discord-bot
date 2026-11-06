# Visual mission

> One sentence: **every Keystone screen is graded, and the weakest screen is the
> next pass.**
>
> The machine half is [`surfaces.json`](../../machine/surfaces.json); the gate is
> `pnpm audit:visuals`, which runs inside `pnpm check`.

The bot already answers more questions in one screen than Dyno, MEE6, Carl-bot or
ProBot do. This mission is about the other half: making that answer look and feel
like one product instead of twelve modules that happen to share a process.

## Why "above the top bots" is a structural claim

Discord gives a bot almost nothing visual: one accent colour per container,
markdown, relative timestamps, separators, sections with one accessory, and
buttons. No fonts, no grids, no gradients. So "beautiful" in Discord means:

- a reader knows what the screen is about before parsing a single value;
- the most useful number is in the first two lines;
- every row says where it came from;
- the screen says when it was read and what it could **not** read;
- there is exactly one obvious next click.

The big bots lose on all five: their panels are walls of fields, their history
has no provenance, and their empty states are dead ends. That is the gap this
mission closes, and it is measurable — which is the point.

## The three artifacts

| Artifact | Role |
| --- | --- |
| [`surfaces.json`](../../machine/surfaces.json) | Every visible surface, six grades, its live proof, and its **next** fix. |
| `pnpm audit:visuals` | Fails coverage, evidence, palette and footer rules; prints the weakest surface. |
| This page | The grammar, the rubric, and the rule for converting a surface. |

A surface is anything a human sees: a V2 panel, an embed, a button row, a
dashboard page. If it has no ledger row, `audit:visuals` fails, so a new screen
cannot ship invisible. Dashboard rows use `component: "web"`, name the route and
the page renderer they cover, and are graded on the same six criteria.

## The grammar

Build screens in [`packages/ui`](../04-Modules/diagnostics/Spec.md) primitives, not
by hand:

```text
## 🧭 <@member> · Member timeline
-# this server · events from every module
**Level 4** · 1,240 XP · rank #2 · 60 coins
Joined 3 days ago · invited by <@inviter> · 3 invites retained
Cases **1 open** · Tickets **0 open** · Modmail **1 open**
──────────────
**Recent activity**
• <t:…:R> · 🛡️ **Case #7** · ban · open · `cases`
• <t:…:R> · 🎫 **Ticket** · closed · [channel](https://discord.com/channels/…) · `tickets`
-# +2 older rows not shown.
──────────────
-# Read <t:…:R> · 8/10 stores joined
-# Rows: cases 1 · tickets 1 · levels 1 · economy_ledger 1
-# Failed: form_submissions · Not joined: logs (no member index), AI labels (advisory only).
[ ↻ Refresh ]
```

Rules the primitives enforce:

| Primitive | Rule |
| --- | --- |
| `heading` | `##` glyph + title, plus a `-#` context line naming scope. No bare headings. |
| `facts` | One scannable line, at most five parts, each clipped. |
| `row` / `rows` | `• time · what · source`, at most 12 rows, hidden rows counted. |
| `emptyState` | The fact **and** the command that creates the first row. |
| `footer` | Tiny provenance: read stamp, stores read, stores missing. Three lines. |
| `actionRow` | At most three buttons, at most one `primary`. |
| `ACCENTS` | One accent per **state**, never per author; modules import, never inline hex. |
| `GLYPHS` | The same glyph means the same source in every module. |

## The rubric

Each criterion is graded A–F in the ledger, and an **A requires live proof**.

| Criterion | Question | F looks like |
| --- | --- | --- |
| Structure | Header, facts, section, footer, action? | a title and a pile of fields |
| Density | Can one screen answer the question? | two screens, or a wall of text |
| Honesty | Are sources, failures and truncation named? | silent empty list |
| Freshness | Does it say when it was read, and can it re-read? | "live" numbers from last week |
| Action | Is there one obvious next step? | a dead end |
| Copy | Second person, specific, no jargon? | "operation completed" |

Self-grading runs generous. Two rules keep it honest: an A needs a recorded live
class (`probe`, `mcp`, `gateway` for Discord; `browser` for a real Chromium
session against the running dashboard), and legacy surfaces start at **C or
below** until a pass actually converts them.

## Converting one surface (the loop)

1. `pnpm audit:visuals` — take the weakest surface, not the most interesting one.
2. Rewrite it with the grammar primitives; no new command root, no new module.
3. Add it to the ledger with honest grades and its next fix.
4. Prove it in a real client (see [[Live-Testing]]); record the class and date.
5. Update this page's queue, the module `Status.md`, the journal and the changelog.
6. `pnpm check` — green means the ledger, the tests and the gate agree.

## What is out of scope

- Chasing gradients or images Discord cannot render. The accent, the glyph and
  the layout are the whole palette.
- Grading taste with the script. The audit checks presence, evidence and tokens;
  a human still judges whether the screen is good.
- Rewriting every panel at once. One surface per pass is what keeps the proof
  real and the diff reviewable.

## Current queue

The audit prints this order live; today it starts with the case embed, then the
community and analytics embeds, then the help hub and the three older V2 panels.
The converted `moderation.timeline` is the reference implementation: copy its
structure, not its copy.

**Pass 78 put the dashboard on the ledger.** Every `render…` export in
`apps/web/src/render.ts` now needs a `web` row, so the browser half of the
product is graded by the same gate as the Discord half. The shell, catalog,
activity, directory and analytics rows carry the strongest grades; the older
portability, automation, fleet and instance pages are honest C rows with their
next fix named. The dashboard's own version of the grammar is structural rather
than markdown: one shell with a skip link, breadcrumbs, guild sidebar, read-time
footer and no client JavaScript.

**First conversion, proven live (2026-11-05, gateway).** A signed-in Discord web
client ran `/mod history user:@Mr Bubba` in the development guild. The panel
rendered the grammar — heading with a server context line, three fact lines, two
source-tagged case rows, a three-line footer naming `10/10 stores joined` and the
stores that are not joined — and its `↻ Refresh` button edited that same message
in place with a new read stamp. Reading it live also caught three copy defects
that the tests had blessed: a raw guild snowflake, `Read: cases 2` where a noun
phrase was meant, and a dry-run refusal naming an option `warn` did not have.
That is the loop working: the rubric, the client and the gate each found
something the other two could not.
