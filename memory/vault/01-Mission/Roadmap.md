# Roadmap

> This is the phase index. For the reasoning, the specialist team and the
> research program read [[Master-Plan]]; for the feature-level definition of
> done read [[Parity-Matrix]].

Each phase ends with **a demo, a doc and a memory update**. A phase is not done
because the code exists; it is done when a stranger can run it and read why it
looks the way it does.

## P0 — Foundation (done)

Kernel, module contract, reference module, memory system, strict TypeScript,
tests that need no token, command-budget ledger.

**Exit:** `pnpm check` green on a fresh clone; `modules/diagnostics` copied as a
template produces a working command.

## P1 — Substrate

**Done — 2026-11-01.** Postgres data spine and ordered migrations, the Drizzle
settings repository behind P0's interface, Redis cooldowns with an explicit
fallback, a BullMQ worker plus an in-process driver, OpenTelemetry with
traceparent propagation, `/setup`, a bundled production build and compose.

**Exit evidence:**

- Settings survive a close-and-reopen cycle against a real Postgres engine
  (PGlite) with JSONB fidelity; 56 tests pass.
- A transient job failure retries and applies its side effect once; a permanent
  failure stops at the attempt limit and is recorded as `failed`.
- One trace id spans the command, both settings calls and the enqueued job.

**Audited pass 04.** The retry policy is now one `RetryPolicy` object shared by
`retryOptions` and the in-process driver, so the test exercises the production
numbers. `/setup`'s permission guard and zero-write behaviour are asserted
through dispatch, and the restart test writes through `SettingsService` with
arrays and a numeric-looking string. The worker now pings Redis with a
five-second bound before it logs ready, so a configured-but-unreachable cache
fails startup with a redacted URL instead of a false ready line.

**Gap:** no Docker daemon, Postgres server or Redis binary exists here, and the
WSL user cannot install one. Live BullMQ retry, live Redis cooldown atomicity
and a live Postgres run were therefore not observed; the same contracts are
proven on the shared-policy in-process driver, an atomic Redis stand-in and
PGlite. See [[01-Mission/Status|project status]] for the exact proven/unproven
table.

**Deviation:** `/setup` ships as an embed, not a Components V2 panel. The
defer-then-edit + 40-slot budgeter belongs with `packages/ui` in P3; spending
component budget before the budgeter exists would be backwards.

## P2 — Moderation & security

**Core done — 2026-11-01.** Cases and atomic case numbers, `/mod`, the invite/
mention/duplicate scanner, native AutoMod plan, evidence cards, review queue,
appeals, anti-nuke, anti-raid, quarantine, join gate, `/verify` and action
logging. AI classification stays P4 by design.

**Exit evidence:** the scripted raid test contains 10 joins, 5 invite posts and
one webhook: 20 cases, 11 quarantine calls, 5 message deletes, 1 webhook delete
and 1 timeout. Every case has a reason and an appeal button. Under the default
dry-run the same run makes zero punitive calls and records `alerted` cases.
`DrizzleCaseStore` allocates concurrent case numbers without duplicates on
PGlite and persists events/state.

**Gap:** live Discord actions, gateway events, buttons and native AutoMod sync
are not observed here; no token/guild/daemon exists. Join-gate and temporary-
action expiry jobs are not wired yet. See [[04-Modules/moderation/Status|the
moderation status]] for the exact proven/unproven split.

**Deviation:** appeals use `/appeal` plus one button row rather than a full
Components V2 panel; the 40-slot budgeter remains P3.

## P3 — Community

**Complete in-repo — 2026-11-01.** All named P3 features, including birthdays,
suggestions, select-menu roles, per-channel starboard overrides, delayed
autorole, sticky messages and archived seasonal reset. `/rank`, `/ticket` and
`/tools` remain the only roots; the ledger is 10/100.

**Exit evidence:** 30 P3 tests across services, commands and PGlite; the full
suite is 100 tests / 17 files at P3 exit. Duplicate XP, votes, sticky events and
season starts are idempotent; birthday/season clocks are injected; select role
values are checked against the stored panel; season archives survive reset. See
[[04-Modules/community/Status|community status]] for the exact proven/unproven
table.

**Gap:** no live gateway/token; Discord sends, buttons, selects, threads, voice
and the tick are typechecked but not observed. Goodbye messages, YouTube/Twitch-
specific feeds and MEE6 import are still open; import is P5. No open P3 item is
claimed as verified.

## P4 — AI layer and economy hardening

**Complete in-repo — 2026-11-01.** Provider abstraction, hard per-guild dollar
and request caps, server-doc RAG on a portable exact index, ticket deflection,
mention-only persona chat, moderation explanations, thread summaries and
advisory classification. The same phase hardened the existing `/rank` economy:
balances are sums over the append-only `economy_ledger`, every movement has a
stable idempotency key, transfers/purchases/gambles serialize on a guild row
lock, and refusals are explicit. `/ai` is the only new root; the ledger is
10/100.

**Exit evidence:** 129 tests / 23 files. A $0.01 cap allows one $0.01 call and
refuses the next before the provider; usage has no prompt/completion fields; a
disabled module still answers `/ai status` and does not unregister commands. Two
concurrent 80-unit transfers against a 100-unit balance leave 20; a retried
request id moves money once; a PGlite close/reopen keeps the balance and ledger;
and self-pay, bot targets, caps and a claimed daily all refuse explicitly. See
[[04-Modules/ai/Status|AI status]] and [[04-Modules/community/Status|community
status]] for the exact proven/unproven tables.

**Gap:** no live provider key, mention event, Discord send or live role grant;
no pgvector extension. The local exact-index harness ran 1M×32 (p95 136.96 ms,
recall 1.0); the 1M×1536 pgvector ANN gate is open in [[PGVector-Fleet]]. The
module is not claimed as pgvector. Off by default with a per-feature kill switch.
The Postgres guild lock is exercised on PGlite, not a Postgres server.

## P5 — Dashboard & fleet

Next.js dashboard, per-guild authorisation, fleet view, config templates, drift
detection, importers (MEE6 XP, Dyno cases, Carl reaction roles), backup/restore
with message history.

**Exit:** import a real 5k-member server in under 10 minutes and restore it into
a clean test server.

## P6 — Music & activities

Bring-your-own Lavalink, disabled by default; legal page; Activities spike.

**Exit:** operator can enable music with their own node; the repo ships no
streamer and says why.

## P7 — Open-source launch

Curriculum polished, CONTRIBUTING, GOVERNANCE, SECURITY.md, Code of Conduct,
status page, top.gg + App Directory listing, one-command self-host.

**Exit:** a stranger self-hosts in one command and ships a module in an afternoon.

## P8 — Hardening

Sharding, load tests, SLOs, annual privileged-intent review runbook, incident
drills, dependency-upgrade policy for discord.js v15.

**Exit:** load test at target shard count, and the v15 migration is a contained
PR rather than a rewrite.

## Sequencing rule

P2 before P3 is deliberate: the security and moderation model defines the case
file that leveling, tickets and AI all reference. Building community features
first would mean retrofitting accountability into four modules later.
