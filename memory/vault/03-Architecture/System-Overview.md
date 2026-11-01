# System overview

## Shape

```
                 Discord gateway / HTTP API
                            │
                 ┌──────────▼──────────┐
                 │      apps/bot       │  adapt · compose ports · dispatch · shut down
                 └──────────┬──────────┘
                            │  InteractionLike + CommandContext
                 ┌──────────▼──────────┐
                 │   packages/kernel   │  registry · guards · settings · dispatch · budget
                 └──────────┬──────────┘
        ┌───────────────────┼───────────────────┐
┌───────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│ modules/<name> │ │  apps/worker    │ │  apps/web (P6)  │
└───────┬────────┘ └────────┬────────┘ └─────────────────┘
        │                   │
┌───────▼───────┐ ┌─────────▼───────┐ ┌─────────────────┐
│  packages/db  │ │ packages/queue  │ │ packages/cache  │
│  Postgres     │ │ BullMQ          │ │ Redis           │
└───────────────┘ └─────────────────┘ └─────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │ packages/telemetry  │  OTLP or no-op
                 └─────────────────────┘
```

## The two rules

**Dependencies point inward.** A module may depend on the kernel. The kernel
depends on nothing of ours and never imports discord.js, Drizzle or BullMQ.
`apps/bot` knows about discord.js and composes the adapters; `apps/worker` knows
about BullMQ; `apps/web` knows about HTTP sessions and OAuth; `packages/db` knows
about Postgres. The web app shares the kernel ports and the module catalog, so it
cannot drift from the bot's settings schemas.

**One composition root.** `apps/bot/src/runtime.ts` is the only function that
chooses an implementation of a port. A module cannot ask which database is in
use, because it only ever sees the interface.

## Request lifecycle

1. discord.js emits `interactionCreate`.
2. `adapt.asInteractionLike` narrows it to `commandName`, `guildId`, `channelId`,
   `userId`, `interaction.id`, parsed `options`, `permissions` and the four reply
   methods.
3. `dispatchCommand` resolves the command and opens one tracing span.
4. Guards run in order — guild, permissions, cooldown (via the injected store).
5. `execute` runs with a settings handle bound to its module, plus the queue and
   health ports.

For the development-only `!` message bridge that feeds the same pipeline when an
MCP cannot invoke slash commands, see [[Live-Testing]].
6. Errors are redacted: `UserError` text reaches the user, everything else is
   logged and replaced with a generic message.

## Ports and adapters

| Port | Interface | Production | Local / test |
| --- | --- | --- | --- |
| Settings | `SettingsRepository` | `DrizzleSettingsRepository` | `InMemorySettingsRepository` |
| Cooldowns | `CooldownStore` | `RedisCooldownStore` (`SET NX PX`) | `InMemoryCooldownStore` |
| Queue | `JobQueue` | `BullJobQueue` / `createBullWorker` | `InProcessJobQueue` |
| Idempotency | `IdempotencyStore` | `PostgresIdempotencyStore` | `InMemoryIdempotencyStore` |
| Health | `HealthProbe` | runtime probe | `staticHealth()` |
| Tracing | `Telemetry` | OTLP HTTP exporter | no-op, or in-memory spans |
| Moderation | `ModerationActions` + `CaseServicePort` | Discord actions + `DrizzleCaseStore` | action recorder + `InMemoryCaseStore` |
| Community | `CommunityStore` + `CommunityActions` | Discord actions + `DrizzleCommunityStore` | in-memory store + recording actions |
| AI | `AiProvider` + `AiStore` + `AiPort` | OpenAI-compatible provider + `DrizzleAiStore` | deterministic provider + `InMemoryAiStore` |

See [[ADR-0006-ports-and-adapters]] for why, and [[Redis]] for operations.

Gateway security events take a parallel path: the adapter translates joins,
messages and audit-log entries into `SecurityEvent` values, and
`SecurityCoordinator` writes a case before calling a moderation action. See
[[ADR-0007-moderation-capability-port]].

Community events take the parallel seam: gateway message, reaction, member join,
voice and button events call the P3 services; `/rank`, `/ticket` and `/tools`
read the same `CommunityPort`. See [[ADR-0008-community-capability-port]].
Select-menu values are reconciled server-side, and season reset archives the XP
projection before clearing it. See [[ADR-0009-select-rows-and-season-archives]].

Economy writes do not go through the command-level check. `EconomyService` calls
`CommunityStore.transfer` or `spend`; the adapter takes a per-guild lock —
`SELECT … FOR UPDATE` on the `guilds` row in Postgres, one queue in the in-memory
store — reads the ledger sum, checks funds and inserts. The Discord interaction
id is the idempotency key, so a retried interaction is a duplicate, not a second
movement. See [[ADR-0011-economy-ledger-and-double-spend]].

The P4 AI seam is narrower: commands and the mention event call `AiPort`; the
provider is selected in the composition root, and the hard per-guild budget is
checked in `AiService` before any provider call. `ai_usage` has counters only;
`ai_documents` holds explicit admin docs. See [[ADR-0010-ai-provider-and-caps]].

## Data spine (P1)

`guilds`, `settings` (`(guild, module, key)` unique, JSONB value),
`members`, `cases` + `case_events` + `case_counters`, `tickets`, `levels` / `xp_events`,
`economy_ledger`, `audit_events`, `job_receipts`, `imports`, `backups`,
`community_records` (migration 0004 for P3 feature state), and `ai_documents` /
`ai_usage` (migration 0005 for P4).

`economy_ledger` is append-only and has no balance column: a balance is
`SUM(amount)` for a `(guild, user)` pair. The unique idempotency key is the
duplicate guard; the guild row is the write lock.

Migrations are ordered and transactional, recorded in `schema_migrations`, and
run only through `pnpm db:migrate` — never on boot.

## Packages

| Path | Responsibility | Knows about |
| --- | --- | --- |
| `packages/kernel` | Registry, validation, guards, settings service, dispatch, budget, ports | Nothing external |
| `packages/config` | Zod-validated environment | `process.env` |
| `packages/db` | Drizzle schema, migrations, Postgres repositories, health | Postgres |
| `packages/cache` | Redis cooldowns and the explicit fallback | Redis |
| `packages/queue` | BullMQ adapter, in-process driver, idempotent runner | BullMQ |
| `packages/telemetry` | Tracing wrapper and traceparent propagation | OpenTelemetry |
| `packages/testing` | Token-free fixtures | nothing |
| `apps/bot` | Gateway process and composition root | discord.js |
| `apps/worker` | BullMQ consumer, job handlers | BullMQ, Postgres |
| `apps/web` | Optional dashboard/API, OAuth sessions, guild authorization, settings writes | node:http, Postgres |
| `packages/module-catalog` | One module list for bot and web | modules |
| `modules/*` | Features | kernel only |

## Failure posture

- The bot refuses to boot when the command budget is exceeded.
- A bad manifest throws at registration with every problem listed.
- A configured-but-unreachable Postgres or Redis is a boot error; an unset
  variable selects a logged local mode instead.
- Jobs are at-least-once. Receipts make a completed job a no-op, and handlers
  must be idempotent.
- Economy writes serialize per guild. Under contention a command waits rather
  than overspending; a duplicate key returns the existing balance.
- SIGINT/SIGTERM close the queue, cache, database and tracer before exit.
