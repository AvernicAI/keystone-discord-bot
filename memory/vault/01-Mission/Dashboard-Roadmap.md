# Dashboard roadmap

> Sourced market evidence: [[Web-Dashboard-Benchmark-2026]].
> Architecture and routes: [[Dashboard]]. Security contract: [[Dashboard-Security]].
> Surface grades: [[Visual-Mission]] and [`surfaces.json`](../../machine/surfaces.json).

The dashboard exists to answer five questions in the first five minutes, because
that is where the surveyed bots are weak: **what can it do, what is on here, what
is still unconfigured, did my save happen, and where is that channel id?**

Pass 78 built all five at a first level. This page is the order of the rest,
chosen so each step is provable in a browser and none of them adds a paid
service or a client bundle.

## Shipped in pass 78

- One shell and one palette (`apps/web/src/shell.ts`, `theme.ts`) across the
  landing, guild list, overview, analytics, activity, directory, settings,
  portability, automation, fleet, instance and error pages.
- A goal-grouped module catalog with an audited enable/disable toggle.
- Computed readiness: four facts from real settings, each with the link that
  fixes it.
- A guild activity ledger page over the existing audit rows.
- A read-only channel/role directory behind a `DirectoryPort`, so settings ids
  can be found without Developer Mode.
- Analytics coverage language and a source-row table.
- Every page renderer in the visual ledger, enforced by `pnpm audit:visuals`.

## Next, in order

| # | Change | Why now | Proof |
| --- | --- | --- | --- |
| 1 | Channel and role **pickers** in the schema editor, backed by the directory port, with a text fallback | The benchmark's one clear loss: Ticket Tool and Wick select; Keystone still asks for a snowflake | Rendered form test for each schema type, then a browser save round trip |
| 2 | Explicit save state: dirty detection, a sticky "saved at" line, and the audit row id in the notice | Carl-bot's open issue is the warning; Keystone already writes the row, it just does not surface it after redirect | Browser run: change, save, see the named keys and the ledger row |
| 3 | Per-server health line on `/dashboard`: modules on, open cases, open tickets, last write | The list currently answers "which servers" but not "which needs me" | Browser run with two servers, one configured and one not |
| 4 | Analytics coverage strip naming each logging switch that is off | A zero from a disabled logger looks identical to a quiet server | Snapshot test per source plus a browser run on a guild with logging off |
| 5 | Human-readable settings diffs on the activity page | JSON before/after is accurate and unreadable | Pure formatter tests for boolean, number, enum, array and record |
| 6 | A receipt-shaped portability page: export, diff, restore and rollback in one flow | Four pages currently tell one story | Route test for the full sequence; browser run on Postgres |
| 7 | Webhook delivery log with retry and the last response code | A failing endpoint is not diagnosable from the page that created it | Fake-transport test for retry and backoff; browser read |
| 8 | Session revoke buttons and a lockout counter on the instance page | The owner can read sessions but not act on one | Route test, then browser run as the configured owner |
| 9 | Mobile pass at 360 px and 768 px, with a sticky module filter | Every surveyed dashboard is weak on mobile; Keystone has not been measured | Browser screenshots at both widths, recorded in the ledger |
| 10 | A search box over modules and pages (no client JavaScript: a GET form) | Finding things is the first table-stakes row | Route test for query matching; browser run |

## Guardrails

- **Manage Server is enough.** Never add an Administrator-only gate to match the
  competition; the benchmark documents that as their weakness, not a norm.
- **No paid tier.** No analytics provider, hosted database, email or AI service.
- **No client bundle without a decision.** The CSP has no `script-src`; adding
  one is an ADR, not a page change.
- **One shell.** A page that writes its own `<html>` is a bug, not a shortcut.
- **Every page is graded.** A new renderer without a `surfaces.json` row fails
  `pnpm audit:visuals`.
- **Honest proof classes.** A dashboard A needs a `browser` proof with a date; a
  route test alone is B evidence at most.
