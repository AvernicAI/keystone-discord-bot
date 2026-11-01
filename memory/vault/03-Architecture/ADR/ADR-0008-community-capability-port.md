# ADR-0008 — One community capability port over typed data and Discord actions

## Status

Accepted, 2026-11-01. Implemented by P3.

## Context

P3 adds thirteen user-facing features across leveling, economy, community,
tickets and content. They share data (guild, member, ledger) and external actions
(send, edit, thread, role, voice channel), but they do not share business rules.
A per-feature kernel port would add roughly thirteen contracts and thirteen
composition-root branches; a per-feature SQL repository would duplicate the same
Drizzle plumbing and make cross-feature export harder.

The existing P2 precedent is a narrow `ModerationPort` with a case service and
Discord actions. P3 needs the same separation without turning the kernel into a
feature catalogue.

## Decision

Define **one `CommunityPort`** with two structural halves:

1. `CommunityStore` — typed level, ledger, ticket and guild-scoped record
   operations. It is the only persistence surface the module knows.
2. `CommunityActions` — send/edit/DM, role toggle, thread, voice channel, rename
   and member-count actions. It is the only Discord surface the module knows.

The module owns the services (`LevelingService`, `EconomyService`,
`TicketService`, etc.) and receives the port. `@keystone/db` implements the store;
`apps/bot/src/community-actions.ts` implements the actions. Tests use the
in-memory store and a recording action adapter.

Non-spine P3 state uses `community_records(guild_id, kind, key, jsonb)` rather
than a new table per panel/tag/feed. The existing `levels`, `xp_events`,
`economy_ledger` and `tickets` tables remain typed because their invariants
(idempotency, sums, SLA timestamps) are central.

## Consequences

- Adding a P3 feature does not change the kernel contract unless it needs a new
  **action**; most features only add store methods or records.
- Export/delete has one obvious guild-scoped surface for feature records.
- The store interface is broader than a single-purpose port. It is split by
  method group in `packages/kernel/src/community.ts` so a future ADR can divide
  it if the interface becomes a change bottleneck.
- `community_records` is deliberately schemaless. It is indexed by guild/kind,
  but a future dashboard query that needs a typed column must add a migration
  rather than pretend JSON is a query plan.

## Alternatives

- **Thirteen feature ports.** Rejected: composition-root and test boilerplate,
  plus thirteen chances to wire the wrong store. The services already separate
  policy; the port only needs to separate infrastructure.
- **One table per P3 feature.** Rejected for now: eleven near-identical
  `(guild, id, data)` tables add migration and export cost without a query shape
  that needs them. Typed tables stay for the spine.
- **Let modules import Drizzle.** Rejected: violates the P1 port rule, makes
  PGlite tests leak SQL and makes P5 export/import a cross-module rewrite.
- **Put all features in one command root.** Rejected: `/tools` is already the
  utility hub; `/rank` and `/ticket` are distinct mental models. Three roots is
  still only 9/100.
- **Ship select menus in P3.** Deferred: buttons cover the safety path; select
  menus need a second component shape and a separate budget test. Recorded as an
  open P3 limitation, not silently claimed.
