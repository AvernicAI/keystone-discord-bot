# ADR-0006 — Ports and adapters for persistence, cache and queue

## Status

Accepted — 2026-11-01. Implemented in P1.

## Context

P0 shipped working code with three deliberately temporary backings: settings in a
Map, cooldowns in a Map, and no queue at all. The honest options for P1 were:

1. Import Drizzle/Redis/BullMQ where they are used. Fastest to write, and it
   would put a database client inside every module within two phases.
2. Build a service layer with a repository per table. Familiar, but it spreads
   database types through the kernel and makes the token-free test suite need a
   database.
3. Define narrow ports in the kernel and keep every implementation in an adapter
   package, chosen once in the composition root.

The plan already promised that P0's in-memory implementations would be swapped
"without touching a module". That promise is the constraint.

## Decision

The kernel owns five ports — `SettingsRepository`, `CooldownStore`, `JobQueue`,
`HealthProbe`, `IdempotencyStore` — plus the `Telemetry` interface. Modules see
only those (and the command context). Adapters live outside the kernel:

| Port | Production | Local / tests |
| --- | --- | --- |
| Settings | `DrizzleSettingsRepository` (Postgres) | `InMemorySettingsRepository` |
| Cooldowns | `RedisCooldownStore` (`SET NX PX`) | `InMemoryCooldownStore` |
| Queue | `BullJobQueue` + `createBullWorker` | `InProcessJobQueue` |
| Idempotency | `PostgresIdempotencyStore` | `InMemoryIdempotencyStore` |
| Health | runtime probe over the two handles | `staticHealth()` fixture |
| Telemetry | OTLP exporter | no-op, or in-memory spans |

`apps/bot/src/runtime.ts` is the only place that chooses. A missing
`DATABASE_URL` or `REDIS_URL` selects the local backing and logs a warning; a
configured-but-unreachable service is an error, not a silent downgrade.

## Consequences

- `/setup` can report which backing is live, which is how an operator discovers
  a mistaken deployment instead of guessing.
- Every module test still runs with no token, no Postgres and no Redis.
- The settings JSONB round-trip needed its own column type and a read through
  `::text`: drivers disagree about whether they return parsed JSON. That detail
  lives in one adapter file, not in 40 modules.
- Two implementations of every port is real maintenance. The rule is that a new
  port is added only when a second implementation is plausible; otherwise it is
  a function, not a port.
- Redis is required for the worker. Without it, jobs run in the bot process and
  are lost on restart — loud in the logs, and visible in `/setup`. Before it
  logs ready, the worker performs a bounded five-second Redis ping; a configured
  but unreachable cache is a startup error with its credentials redacted.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Import Drizzle in modules | Every module test would need a database, and the schema becomes the API |
| Repository per table in the kernel | More classes, same coupling; the kernel would depend on Postgres types |
| A generic `Database` global | Untestable in parallel, impossible to swap per environment, hides the fallback |
| Redis-only cooldowns (fail boot) | Local development and the token-free test suite would require a server |
| BullMQ-only queue | No way to verify retry semantics without Redis, and dev needs a worker to do anything |
| Automatic fallback on a *reachable* failure | Hides an outage; cooldowns and jobs silently stop being shared |
