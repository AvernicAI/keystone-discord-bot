# ADR-0013 — Roadmap v2: portability first, dashboard second

## Status

Accepted · 2026-10-31 · P4.5

## Context

The original P5–P8 plan put the dashboard and fleet view first, then music,
launch and hardening. Six research passes changed the evidence:

- No surveyed generalist documents a full export of its own data.
- Portability exists because destination bots implement pull or file import.
- Dyno, Carl-bot and Wick expose no usable data egress.
- The dashboard is table stakes; every paid bot has one.
- The unsolved gaps are portability, low-tier API access, compliance-grade data
  handling and semantic search.
- Discord's channel-obfuscation deadline is 2026-11-16, before any of it.

## Decision

The sequence becomes:

```
P4.5 Platform hardening
P5   Portability and migration
P6   Dashboard, API and fleet
P7   Parity completion, UI and i18n
P8   Music and activities
P9   Open-source launch
P10  Hardening and scale
```

Portability ships before the dashboard because the dashboard needs the export
bundle, import receipts, drift model and deletion receipts to have something
real to display. The dashboard ships before parity completion because it exposes
which settings have no UI and which modules are hard to teach. Music stays
optional and after the core union. Launch waits for a verified v1.0, not a
feature count.

The old labels migrate as follows: old P5 → new P6, old P6 → new P8, old P7 →
new P9, old P8 → new P10. P4.5, P5 and P7 are new.

The import promise is narrowed to match the evidence: **export everything,
import where the source allows, guided manual migration for the rest.** MEE6
levels and user-supplied files are in scope; Dyno/Carl/Wick automation and
scraping are not.

## Consequences

- The first feature phase is data ownership, not a web UI.
- Every old roadmap reference must be updated in the same pass; `memory:check`
  gains a generated feature status and link checks so the vault cannot drift.
- The plan is larger (P4.5–P10), so each phase keeps a ten-minute demo and a
  written retrospective; a missed demo cuts scope, never extends the date.
- The free-core promise is unchanged. No phase adds a feature paywall.

## Alternatives

- **Keep the existing P5–P8 order.** Rejected: it builds a dashboard for data
  that cannot be exported or migrated, and misses the platform deadline.
- **Go straight to the dashboard and add import later.** Rejected: import is the
  differentiator and it constrains the data model the dashboard needs.
- **Promise one-click import from every bot.** Rejected: the sources do not
  expose the data, and scraping is hostile and legally uncertain.
- **Split portability into P5a/P5b to keep the old numbering.** Rejected:
  half-labels make every status page ambiguous. A clean renumber with an
  explicit migration table is easier to teach.
- **Add a paid tier to fund the larger plan.** Rejected for v1.0: retroactive
  paywalls are the most repeated user complaint, and Discord's Premium Apps
  price-parity rules would apply if a hosted tier ever exists.
