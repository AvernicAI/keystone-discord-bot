# Analytics — spec

A read-only answer to "what is happening in this server?" over the rows Keystone
already stores: audit events, moderation cases, invite joins, tickets and command
usage. No analytics table, no second event pipeline and no invented metric.

## Purpose

Carl-bot and Wick sell server insights; Dyno's dashboard shows activity. An
all-in-one bot should answer the same questions from its own data, and it should
be able to prove every number. This module therefore aggregates **existing**
ledgers instead of recording a parallel stream that can drift.

The answers are admin-only because audit and case data can identify members.

## Commands

One root, six subcommands. Every subcommand takes an optional `days`
(integer 1–90, default from settings or 7).

| Command | Behaviour |
| --- | --- |
| `/analytics overview` | One summary: logged events, active/opened cases, invite joins/retention, command runs and current open tickets. |
| `/analytics members` | Logged joins/leaves, invite joins, left-since, retained, flagged and unique inviters. |
| `/analytics messages` | Logged message deletes and edits, plus cases with an `automod.*` rule. |
| `/analytics commands` | Total/ok/blocked/error command runs, average latency and the ten highest-volume command paths. |
| `/analytics tickets` | Current open/claimed/closed, opened/closed in the window, average close minutes and SLA breaches. |
| `/analytics export` | The whole snapshot as JSON in an embed, with source row counts. |

Guards: guild-only, `ManageGuild`, three-second cooldown. There is no mutation
subcommand. A disabled module refuses rather than returning a zeroed page.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Allow reads; disabling refuses every view |
| `defaultWindowDays` | integer 1–365 | `7` | Default window when `days` is omitted; the command still caps a request at 90 |

Settings use the module's Zod schema and the shared `SettingsService`. Analytics
does not store any event data in settings.

## Sources and semantics

| View field | Source | Window? |
| --- | --- | --- |
| logged events, member joins/leaves, message deletes/edits | `logging_events` | yes |
| active cases, cases opened, content-filter cases | `cases` | active = current; opened/filter = window |
| invite joins, retained, flagged, unique inviters | `invite_joins` | yes |
| command runs, outcomes, latency | `command_usage` (append-only) | yes |
| open/claimed/closed and SLA breaches | `tickets` | current state; opened/closed/average use the window |

The command prints a **Source rows** field naming each table and how many rows it
contributed. An open ticket or active case is explicitly current state; every
other count is bounded by `since` and `until`. The snapshot never reads message
content, tokens or environment values.

## The write that feeds it

`dispatchCommand` records one `command_usage` row per dispatched **guild**
command, after the result is known:

```text
guild_id, command, path (e.g. "mod ban"), status (ok|blocked|error),
duration_ms, created_at
```

The write is best-effort and happens through an optional `usage` port. A failed
analytics write logs a warning; it must never turn a successful command into an
error. The table is append-only; totals are `SUM`/`COUNT` queries, not counters.

## Where the code lives

- `packages/kernel/src/analytics.ts` — snapshot types and the one `AnalyticsStore`
  port. No Drizzle, no discord.js.
- `packages/db/src/analytics-store.ts` — SQL aggregation. One query per source,
  grouped where possible; no row materialisation for large guilds.
- `packages/db/src/command-usage-store.ts` — append-only write adapter.
- `modules/analytics/src/memory.ts` — local-mode aggregation over the same
  in-memory records the gateway writes.
- `modules/analytics/src/format.ts` — the six rendered views.
- `modules/analytics/src/commands/analytics.ts` — guards, windowing and dispatch.

`MemoryAnalyticsStore` takes reader closures from the composition root. It is a
view over the live in-memory stores, not a second store; when Postgres is
configured, `DrizzleAnalyticsStore` is used instead.

## Non-goals

- Message content, per-user message counts or surveillance. The bot only counts
  events it already retained; unlogged messages do not become a metric.
- A second analytics event table or a nightly rollup. Both would duplicate
  source rows and make the printed number unauditable.
- A dashboard analytics route in this pass. The store is ready for one, but no
  screen was requested and the web auth surface stays unchanged.
- Retention of `command_usage`. It is append-only today; pruning is a named
  follow-up, not silently invented.
- Forecasting, sentiment or "engagement scores". Those are not derivable from
  the rows and would be fiction.

## Limits respected

- One new global root (`14/100`); six subcommands cost no extra slot.
- No new intents, permissions or paid service.
- Queries are guild-scoped and bounded to 90 days.
- `command_usage` adds one insert per dispatched guild command.

## Verified by

`modules/analytics/src/analytics.test.ts` (default window, requested days,
non-admin refusal, disabled refusal, JSON export, exact in-memory aggregation),
`packages/db/src/analytics-store.test.ts` (PGlite: seeded stores, guild isolation
and raw `count(*)` cross-check) and the live transcript in
[[04-Modules/analytics/Status|Status]].
