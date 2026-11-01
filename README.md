# Keystone

An open-source, teach-by-default all-in-one Discord bot.

> Every "all-in-one" bot today is two to four half-bots stapled together. Keystone
> ships the union — free, documented, and built so a stranger can add a feature in
> an afternoon.

**Status:** **P4.5 complete in-repo; P5 is next.** The bot has real Postgres
persistence, Redis cooldowns, a BullMQ worker, tracing, moderation cases with a
dry-run-first security engine, leveling and a ledger-backed economy,
button/select reaction roles, welcome/delayed autorole, starboard overrides,
birthdays, suggestions, thread tickets, giveaways, temp voice, content/sticky
tools, feeds, seasons, stat channels and an opt-in AI layer with server-doc RAG,
ticket deflection, mention-only chat, explanations, summaries, advisory
classification and hard per-guild caps.

P4.5 adds the platform hardening the 2026 Discord changes require: a single
channel resolver for the 2026-11-16 obfuscation rollout, required vs optional
gateway intents with an `INTENT_PROFILE` and a `/setup` capability report, and
machine-checked memory (`features.json`, `research.json`, `passes.json`,
`decisions.json`) with generated vault pages. Live Discord actions, gateway
events, scheduler ticks, role grants and provider calls are still unverified
without a token/guild/key; the pgvector ANN benchmark is open.

## Quickstart

Requires Node 22+ and pnpm 12+. Docker is optional but is the fastest path to a
working database and cache.

```bash
# 1. Services + migrations + bot + worker
cp .env.example .env      # add DISCORD_TOKEN
docker compose up

# 2. Or run it locally against the compose services
docker compose up -d postgres redis
pnpm install
pnpm db:migrate           # explicit, idempotent — never on boot
pnpm dev                  # bot
pnpm worker:dev           # second terminal
```

`pnpm check` needs **no token, no database and no network**. Tests run against
structural fakes and a real Postgres engine compiled to WASM (PGlite).

## What is here

```
apps/bot        gateway process — adapter, composition root, dispatch
apps/worker     BullMQ consumer with idempotent handlers
packages/kernel registry · guards · settings · dispatch · budget · ports
packages/db     Drizzle schema, migrations, Postgres repositories
packages/cache  Redis cooldowns + explicit in-memory fallback
packages/queue  BullMQ adapter + in-process driver for tests
packages/telemetry  OpenTelemetry wrapper, off by default
packages/config Zod-validated environment
packages/testing token-free fixtures for module authors
modules/        features (diagnostics, setup, moderation, community, ai)
memory/         the project's brain: Obsidian vault + machine state + journal
```

Read `memory/vault/00-Index/Home.md` next. It is the map.

## The seven promises

1. Free core, permanently. No feature is ever moved behind a paywall.
2. The union of the big three, natively: leveling, automod, reaction roles — plus
   tickets, logs and backup.
3. Explainable moderation: dry-run first, evidence, review queue, appeals.
4. Security that shares config with everything else: anti-nuke, anti-raid, restore.
5. Data is the server's: export everything, delete everything, publish retention.
6. Fleet ops: one dashboard for many servers, importers, drift detection.
7. The repo is the course: spec, tests and a teaching note for every module.

## Commands today

| Command | What it does |
| --- | --- |
| `/ping` | Confirm the bot is alive |
| `/about` | Version and this server's configuration |
| `/setup` | Readiness report: database, migrations, cache, module state |
| `/mod` | Cases, bans, kicks, timeouts, warnings, purge, lock, slowmode, review |
| `/appeal` | Open an appeal for your own case |
| `/verify` | Complete the join gate and leave quarantine |
| `/rank` | XP, leaderboard, rewards, ledger-backed currency, shop, transfers, gambling and seasons |
| `/ticket` | Panel, thread tickets, claim, close, transcript, AI summary and SLA stats |
| `/tools` | Birthdays, suggestions, embeds, tags, reminders, giveaways, polls, feeds, stat channels, sticky and roles |
| `/ai` | Opt-in server-doc answers, ticket deflection, explanations, summaries, advisory classification and hard budget |

Ten of a hundred. See `memory/vault/03-Architecture/Command-Budget.md`.

## Configuration

| Variable | Required | Effect when absent |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | The bot refuses to start |
| `INTENT_PROFILE` | no | `full` requests optional privileged intents; `minimal` runs the core without them and `/setup` names disabled features |
| `DATABASE_URL` | production | Settings are process-local and reset on restart |
| `REDIS_URL` | production | Cooldowns are local; jobs run in the bot process |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | Tracing is a no-op |
| `QUEUE_NAME` | no | Defaults to `keystone` |
| `AI_API_KEY` | no | `/ai` says `unconfigured`; every answer call refuses safely |
| `AI_BASE_URL` | no | Defaults to `https://api.openai.com/v1` |
| `AI_MODEL` / `AI_EMBEDDING_MODEL` | no | Defaults to `gpt-4o-mini` / `text-embedding-3-small` |
| `AI_INPUT_USD_PER_MILLION` / `AI_OUTPUT_USD_PER_MILLION` | no | Rate-card defaults used for the cost cap |

`/setup` reports which mode is live. A configured-but-unreachable service is a
boot error, not a silent downgrade.

Moderation is conservative by default: `dryRun` is true, so the scanner records
and alerts but does not delete, timeout, quarantine, kick or ban. Set
`moderation.dryRun` to `false` in guild settings only after reviewing the cases.

Community features are opt-in where they act on members: welcome, starboard,
temporary voice and reaction-role panels need configuration. XP and the
economy use idempotent event/ledger rows; a retry cannot double-award. Every
economy balance is a `SUM` over `economy_ledger`, transfers and purchases take a
per-guild lock, and self-pay, bot targets, caps, insufficient funds and a claimed
daily are explicit refusals. See `memory/vault/04-Modules/community/Spec.md`.

AI is off by default. Enabling it never enables a feature by itself: choose
chat, deflection, explanations, summaries or classification, and set a monthly
dollar/request cap. Prompts and completions are never stored; only aggregate
counters and explicit admin docs are. See `memory/vault/04-Modules/ai/Spec.md`.

## Development

```bash
pnpm check            # typecheck, tests, budget, intent/channel audits, memory
pnpm memory:render    # regenerate Feature-Status, Claims, Decision-Index, Pass-Ledger
pnpm memory:check     # validate machine memory, generated pages and vault links
pnpm benchmark:ai 1000000 32 10   # research harness, not part of check
pnpm build            # dist/bot.js, dist/worker.js, dist/migrate.js
```

## Contributing

Start with `memory/vault/07-OpenSource/Contributing.md`, then
`memory/vault/05-Learning/01-the-module-contract.md`. Read
`memory/vault/01-Mission/Feature-Status.md` for what is actually shipped, and
open an issue with a spec before writing code — scope control is what keeps this
maintainable.

## Licence

Not chosen yet. AGPL-3.0 with a DCO and no CLA is the recommendation; see
`memory/vault/99-Meta/Open-Questions.md` (Q-1). Until the decision, treat the
code as all-rights-reserved and do not redistribute it.
