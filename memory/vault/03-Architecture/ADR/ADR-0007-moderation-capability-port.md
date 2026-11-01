# ADR-0007 — A moderation capability port and an event-driven security core

## Status

Accepted — 2026-11-01. Implemented in P2.

## Context

P1's kernel had one interaction path and one settings/queue/cooldown contract.
P2 needs two things the interaction path cannot provide:

1. Punitive actions (ban, kick, timeout, delete, quarantine) that must be
   testable without a token or a live guild.
2. Gateway events (joins, messages, audit-log entries, webhooks) that must feed
   the same case and policy path as `/mod`.

Putting discord.js calls in the module would make every moderation test need a
gateway and would spread 403 handling across commands. Putting the security
engine in the bot app would make the policy untestable and hide it from the
module contract.

## Decision

Add three structural pieces to the kernel:

- `ModerationActions` — the external action port. Discord implements it in
  `apps/bot/src/moderation-actions.ts`; tests use a recorder. Every action checks
  the bot's permission before the API call.
- `CaseServicePort` — the case operations (`open`, `get`, `list`, `note`,
  `review`, `appeal`, `setState`). `CaseService` owns the invariants; Postgres
  and the in-memory store implement `CaseStore` beneath it.
- `CommandContext.moderation` — the composition root supplies the case service
  and action port; commands never import Drizzle or discord.js.

The security engine is a pure value-producing policy core. `SecurityCoordinator`
persists a case **before** calling an action, then appends the result and posts
the notification. `apps/bot/src/moderation-events.ts` translates gateway events
into `SecurityEvent` values. The same engine handles the scripted-raid test and
production.

Dry-run is a setting, not a code branch in each rule. When true, the coordinator
creates `alerted` cases and notifications but never calls a punitive action.

## Consequences

- Every command and every security rule is testable without a token; the P2
  raid fixture runs in milliseconds.
- The case trail survives a Discord failure. A failed action leaves an open case
  with a reason and a review path, rather than disappearing.
- `CommandContext` grew a domain port. That is a contract change for module
  authors, so it is documented here and in [[Module-Contract]].
- The adapter is the only place that knows discord.js; the v15 migration remains
  contained.
- In-memory heat is disposable. A restart resets raid counters; cases and
  appeals remain durable.
- Live gateway and Discord action calls are still unverified in this
  environment. That is a verification gap, not a reason to move policy into the
  adapter.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Discord calls inside `modules/moderation` | Tests would need a token/guild; 403 handling would spread across commands |
| Security engine in `apps/bot` | Policy becomes untestable and invisible to the module contract |
| One case repository per command | Duplicated numbering/event logic; appeals drift from actions |
| Case writes after the action | A failed or interrupted action leaves no accountability record |
| Alert-only as a separate mode instead of a setting | Two paths diverge; the unsafe path is easier to call by accident |
| A generic event bus with untyped payloads | Harder to teach and to validate; the coordinator needs explicit events |
| Native AutoMod only | Discord cannot express our evidence, appeal or review flow; it is a second layer, not the record |
