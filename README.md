# Keystone

**Keystone** is an open-source, teach-by-default, all-in-one Discord bot. The
name is the bot and the project: one foundation that moderation, community,
tickets, economy and AI all stand on.

**Repository:** https://github.com/RNGBubba/keystone-discord-bot

> Every "all-in-one" bot today is two to four half-bots stapled together.
> Keystone ships the union — free, documented, and built so a stranger can add a
> feature in an afternoon.

**Status:** P0–P5 are complete in-repo. P6 (dashboard, API and fleet) is next.
The command ledger is **10/100**, there are **5 modules**, and `pnpm check`
covers **171 tests across 28 files** without a Discord token, database or
network. Live on 2026-11-01: the bot logged in, registered 10 commands through
Discord, answered a Qwen3:8b mention in `#ai-chat`, and ran real moderation,
community and AI commands through a development message bridge. Slash
`InteractionCreate` from a human client is still the next live check.

This repo is both the product and the course: every module has a spec, tests, a
teaching note and a status page. The docs are the source of truth, not a
marketing site.

---

## Contents

- [What you need](#what-you-need)
- [How to run](#how-to-run)
- [Discord app setup](#discord-app-setup)
- [Configuration](#configuration)
- [Commands](#commands)
- [Features](#features)
- [Current progress](#current-progress)
- [How to add stuff](#how-to-add-stuff)
- [How to have an agent read it easily](#how-to-have-an-agent-read-it-easily)
- [How to set up the Obsidian vault](#how-to-set-up-the-obsidian-vault)
- [Live testing and command sync](#live-testing-and-command-sync)
- [Architecture](#architecture)
- [Contributing and licence](#contributing-and-licence)

---

## What you need

**Required**

- **Node.js 22+** and **pnpm 12+** (`corepack enable` is the easiest way).
- A **Discord application** and bot token.
- A server where you can invite the bot.

**Recommended for a real deployment**

- **Postgres 16** for settings, cases, XP, economy, tickets and AI usage.
- **Redis 7** for shared cooldowns and the BullMQ worker.
- Docker is optional; `compose.yaml` starts Postgres, Redis, migrations, the bot
  and the worker together.

**Optional**

- An OpenAI-compatible AI provider. Without one, `/ai` reports `unconfigured`
  and every AI call refuses safely. Ollama + Qwen3 works locally.
- An OTLP endpoint for tracing. Tracing is off by default.

Local memory mode is a supported first run: leave `DATABASE_URL` and `REDIS_URL`
empty and settings/cooldowns/jobs live in the process. They reset on restart.

## How to run

### 1. Install

```bash
git clone https://github.com/RNGBubba/keystone-discord-bot.git
cd keystone-discord-bot
corepack enable
pnpm install
cp .env.example .env
```

Put `DISCORD_TOKEN` in `.env`. See [Discord app setup](#discord-app-setup).

### 2. Fastest local smoke (no Postgres, no Redis)

Leave `DATABASE_URL` and `REDIS_URL` empty in `.env`, then:

```bash
pnpm dev
```

You should see `runtime ready` and `ready` in the log. If `INTENT_PROFILE=full`,
the Developer Portal must have **Server Members** and **Message Content**
enabled, or Discord closes the gateway with code `4014`. Set
`INTENT_PROFILE=minimal` to boot without privileged intents and let `/setup`
name the disabled features.

### 3. Full local stack

```bash
docker compose up -d postgres redis
pnpm db:migrate          # explicit, idempotent — never on boot
pnpm dev                 # bot
pnpm worker:dev          # second terminal: BullMQ consumer
```

`pnpm db:migrate` is safe to rerun. Postgres data lives in the `pgdata` volume.

### 4. All-in-one Docker

```bash
docker compose up --build
```

This builds the bot, runs migrations once, then starts the bot and worker.
`docker compose up -d postgres redis` is the lighter path when you want hot
reload with `pnpm dev`.

### 5. Verify without secrets

```bash
pnpm check
```

This runs typecheck, the full test suite, the command-budget audit, the intent
and channel audits, and the memory consistency check. It must stay green in CI
without a token or network.

### 6. Register or refresh Discord commands

The bot writes commands at boot only when the server set has drifted, then reads
them back and logs any mismatch. For a payload-only change (description, options)
or a deliberate clean slate:

```bash
pnpm commands:sync      # atomic replace
pnpm commands:resync    # clear, register, fetch back and verify
```

Discord limits global bulk overwrites to **2 per 10 minutes**. `commands:resync`
uses both slots; if it is rate-limited it waits and retries, but do not loop it.

## Discord app setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create an application. Name it **Keystone** (or your own instance name).
2. **Bot** → reset/copy the token. Treat it like a password; never commit `.env`.
3. **Bot** → Privileged Gateway Intents:
   - **Server Members** — welcome, delayed autoroles, join gate, role persistence.
   - **Message Content** — automod scanner, ticket transcripts, starboard snapshots.
   - If you cannot enable them, set `INTENT_PROFILE=minimal`; the core still runs.
4. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`.
   - Permissions: for a first run, **Administrator** is simplest. Least privilege:
     `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`,
     `Use Application Commands`, `Manage Roles`, `Manage Channels`,
     `Manage Messages`, `Add Reactions`, `Create Public Threads`,
     `Manage Threads`, `Connect`, `Moderate Members`, `Ban Members`,
     `Kick Members`.
5. Invite the bot, then start it as above. `/setup` is the first command to run.

## Configuration

All values are validated by `packages/config`. Never put secrets in a Discord
message or the vault.

| Variable | Required | Effect when absent |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | The bot refuses to start |
| `INTENT_PROFILE` | no | `full` requests optional privileged intents; `minimal` runs the core and `/setup` names disabled features |
| `DATABASE_URL` | production | Settings are process-local and reset on restart |
| `REDIS_URL` | production | Cooldowns are local; jobs run inside the bot process |
| `QUEUE_NAME` | no | Defaults to `keystone` |
| `OTEL_ENABLED` / `OTEL_EXPORTER_OTLP_ENDPOINT` | no | Tracing is a no-op |
| `AI_API_KEY` | no | `/ai` says `unconfigured`; every answer call refuses safely |
| `AI_BASE_URL` | no | Defaults to `https://api.openai.com/v1` |
| `AI_MODEL` / `AI_EMBEDDING_MODEL` | no | `gpt-4o-mini` / `text-embedding-3-small` |
| `AI_INPUT_USD_PER_MILLION` / `AI_OUTPUT_USD_PER_MILLION` | no | Rate-card defaults for the hard cost cap |
| `AI_DISABLE_THINKING` | no | Sends Ollama's `think: false`; use it for Qwen3 or reasoning can consume the whole output budget |
| `DEV_GUILD_ID` | no | Development only: seeds AI chat in memory and enables `!` commands plus bot-authored mentions in that one guild |

`/setup` reports which mode is live. A configured-but-unreachable service is a
boot error, not a silent downgrade.

AI is **off by default**. Enabling the module never enables a feature by itself:
choose chat, deflection, explanations, summaries or classification, and set a
monthly dollar and request cap. Prompts and completions are never stored; only
aggregate counters and explicitly added admin docs are. See
[the AI spec](memory/vault/04-Modules/ai/Spec.md).

Moderation is conservative by default: `dryRun` is true, so the scanner records
and alerts but does not delete, timeout, quarantine, kick or ban. Review cases
before setting `moderation.dryRun` to `false`.

Community features are opt-in where they act on members: welcome, starboard,
temporary voice and reaction-role panels need configuration. XP and economy
writes are idempotent; every balance is a `SUM` over `economy_ledger`, and
double-spend, self-pay, bot targets, caps and insufficient funds are explicit
refusals. See [the community spec](memory/vault/04-Modules/community/Spec.md).

## Commands

Discord's global limit is 100; Keystone uses **10**. Slash commands are the
product surface. In development, `DEV_GUILD_ID` also enables the `!` bridge for
message-only harnesses.

| Command | Actions / options | What it does |
| --- | --- | --- |
| `/ping` | — | Confirm the gateway is alive and show uptime |
| `/about` | — | Version, module state, teaching link |
| `/setup` | — | Database, migrations, cache, intents and next-step report |
| `/mod` | `ban`, `kick`, `timeout`, `warn`, `purge`, `lock`, `unlock`, `slowmode`, `case`, `note`, `history`, `review` | Moderation with cases, reasons, evidence and a review queue |
| `/appeal` | `case`, `message` | Open an appeal for your own case |
| `/verify` | — | Complete the join gate and leave quarantine |
| `/rank` | `view`, `leaderboard`, `rewards`, `admin`, `balance`, `daily`, `pay`, `shop`, `buy`, `gamble`, `ledger`, `season` | XP, levels, ledger-backed currency, shop and seasons |
| `/ticket` | `panel`, `open`, `claim`, `close`, `add`, `transcript`, `summary`, `stats` | Thread tickets, claiming, transcripts, AI summary and SLA stats |
| `/tools` | `embed`, `tag`, `reminder`, `schedule`, `giveaway`, `giveaway-end`, `giveaway-reroll`, `poll`, `feed`, `stat`, `welcome`, `roles`, `starboard`, `starboard-override`, `voice`, `birthdays`, `birthday`, `suggestions`, `suggestion`, `suggestion-decide`, `sticky` | Community utilities and panels |
| `/ai` | `status`, `ask`, `chat`, `classify`, `docs-add`, `docs-list`, `docs-remove`, `deflect`, `explain`, `summary`, `budget` | Opt-in server-doc answers, advisory classification, explanations, summaries and hard caps |

`/ticket summary` and `/ai summary` require `ManageGuild`. `/ai docs-*` and
`/ai budget` require `ManageGuild`; `/ai classify` and `/ai deflect` require
`ManageMessages`. AI is advisory: it never punishes, deletes or claims an action
happened.

## Features

Everything below is free. No feature is moved behind a paywall.

### Platform and operations

- Module registry with a CI-enforced 100-command budget (currently 10).
- Postgres schema and ordered migrations; Drizzle repositories.
- Redis cooldowns and a BullMQ worker, with explicit in-memory fallbacks.
- OpenTelemetry tracing, off by default.
- Required vs optional gateway intents (`INTENT_PROFILE`) and a `/setup`
  capability report.
- One channel resolver for Discord's 2026 channel-obfuscation rollout.
- Versioned export bundle, checksum verification, transactional restore,
  24-hour rollback, deletion receipts, importers and a read-only drift report.
- Token-free tests on PGlite and structural fakes.

### Moderation and security

- Cases with atomic case numbers, notes, review, appeals and evidence.
- `/mod` actions plus dry-run-first message scanning.
- Native AutoMod plan and `Keystone ·` rule ownership.
- Anti-nuke, anti-raid, quarantine, join gate and `/verify`.
- Action logging and an appeal button on case cards.

### Community

- XP and levels, leaderboards, role rewards and seasonal resets.
- Ledger-backed currency, daily, pay, shop, buying, gambling and an audit ledger.
- Button and select reaction roles, welcome/goodbye and delayed autoroles.
- Starboard with per-channel overrides and sticky messages.
- Thread tickets: panel, open, claim, add, transcript, close, stats and AI summary.
- Giveaways, polls, reminders, schedules, feeds and stat channels.
- Birthdays, suggestions and temporary voice rooms.

### AI (opt-in, capped, zero-retention by default)

- Provider abstraction; OpenAI-compatible adapter and a deterministic offline
  provider for tests.
- Hard per-guild monthly dollar and request caps, checked server-side before
  every call.
- Exact-vector server-doc RAG with source citations.
- Ticket deflection that returns a human hand-off without a model call when no
  doc matches.
- Mention-only persona chat, moderation explanations, thread summaries and
  advisory classification.
- Kill switch and per-feature switches. No prompt/completion columns exist.

### Planned (honest roadmap)

- **P6:** Next.js dashboard, per-guild OAuth authorization, fleet view, scoped
  public API tokens, webhooks.
- **P7:** parity completion (forms, events, role persistence, modmail,
  auto-responders, analytics), Components V2 UI, i18n.
- **P8:** bring-your-own Lavalink music, disabled by default; no bundled streamer.
- **P9:** docs site, 14-lesson curriculum, release workflow, self-host kit.
- **P10:** sharding, load tests, SLOs, Discord.js v15 migration.

See [the parity matrix](memory/vault/01-Mission/Parity-Matrix.md) and
[the roadmap](memory/vault/01-Mission/Roadmap.md).

## Current progress

| Phase | State | Evidence |
| --- | --- | --- |
| P0 Foundation | Done | Kernel, module contract, diagnostics, memory, CI |
| P1 Substrate | Done | Postgres, Redis, BullMQ, telemetry, `/setup` |
| P2 Moderation | Done | Cases, scanner, appeals, verify, action logging |
| P3 Community | Done | XP, economy, tickets, tools, events |
| P4 AI + economy | Done | Provider, caps, RAG, chat, explanations, summaries |
| P4.5 Platform hardening | Done | Channel resolver, intents, capability report |
| P5 Portability | Done | Export/restore/rollback, importers, drift |
| P6 Dashboard + API | **Next** | Not started |

Live evidence (2026-11-01): `AI Team#5758` connected, cleared and re-registered
10 global commands, and Qwen3:8b answered a mention in `#ai-chat`. A development
`!` bridge ran `!ping`, `!about`, `!ai status`, `!mod history` and
`!rank leaderboard` through the real dispatch pipeline. `/ticket stats` reached
the `ManageGuild` guard (the MCP bot is not an admin); that check exposed a real
ordering bug, now fixed and unit-tested.

Still open and not claimed as done:

- Slash `InteractionCreate` from a human client (the MCP cannot invoke it).
- Live Postgres, live role grants, live selects/voice/scheduler and a human
  mention in production.
- pgvector ANN at 1M×1536 with production embeddings; the exact index is the
  portable path today.
- MEE6 import is file-based, not a live fetch.
- Dashboard, API and fleet are P6.

## How to add stuff

Read [Module-Contract](memory/vault/03-Architecture/Module-Contract.md) and copy
`modules/diagnostics` as the smallest working template. The short version:

1. Create `modules/<feature>/` with the same package shape as `diagnostics`.
2. Export a `defineModule({...})` manifest with `settingsSchema`,
   `defaultSettings`, commands, intents and `docsPath`.
3. Add commands with `defineCommand({...})`. Declare options and guards; the
   dispatcher runs guild, permission and cooldown checks for you.
4. Put side effects behind a kernel port (`ModerationActions`, `CommunityActions`,
   `AiProvider`, `JobQueue`). Modules must not import discord.js, Drizzle,
   BullMQ or Redis.
5. Add pure tests. Use `packages/testing` and PGlite; never require a token.
6. Add the manifest to `apps/bot/src/modules.ts`, then run:

```bash
pnpm typecheck
pnpm test
pnpm budget
pnpm memory:check
pnpm check
```

7. Add a spec, status and teaching note under `memory/vault/04-Modules/<id>/`,
   plus the matching machine entry. Run `pnpm memory:render`; never hand-edit a
   generated page.

If the feature needs a database table, add a migration in
`packages/db/src/migrations` and a repository; if it needs a Discord permission,
declare it on the manifest. If it needs a new root command, check the budget
first: ten roots are used, ninety remain, and every root is a permanent public
interface.

## How to have an agent read it easily

Point the agent at [`AGENTS.md`](AGENTS.md) first. It contains the read order,
the non-negotiable rules and the current state. The machine-readable memory is
the source of truth:

```text
memory/machine/project.json    phase, modules, decisions, open questions
memory/machine/features.json   every parity row and its honest status
memory/machine/research.json   external claims with source/date/expiry
memory/machine/passes.json     one row per working pass
memory/machine/decisions.json  ADR index
memory/machine/schema.json     the validator contract
```

A good agent prompt is short:

```text
Read AGENTS.md, then memory/machine/project.json and features.json.
Work only on the next open phase. Before you finish: pnpm check, update the
journal, feature status and pass ledger. Do not add a command root without
checking pnpm budget.
```

`pnpm memory:check` validates the machine files, the generated pages and every
wikilink. `pnpm memory:render` regenerates the pages from machine truth. Tests
must never need a token, a live guild or the network.

## How to set up the Obsidian vault

1. Install [Obsidian](https://obsidian.md).
2. **Open folder as vault** → select `memory/vault` (not the repo root).
3. Open `00-Index/Home.md`. Wikilinks work without plugins.
4. Start with `01-Mission/Status.md` for what is proven, `03-Architecture/` for
   how it fits together, and `04-Modules/<id>/` for one feature at a time.
5. The vault is the human half; `memory/machine/` is the machine half. Edit
   machine files, run `pnpm memory:render`, then `pnpm memory:check`. Generated
   pages say “do not edit by hand” at the top.

The `.obsidian` folder is checked in so the graph and link settings travel with
the repo. No community plugins are required.

## Live testing and command sync

The canonical slash surface needs a real interaction. A Discord MCP or bot
account can only post messages, so in development `DEV_GUILD_ID` enables a
message bridge that feeds the same registry, guards, cooldowns and reply adapter:

```text
!ping
!about
!ai status
!mod history
!rank leaderboard
```

The bridge is **never registered in production** and only answers in that one
guild. Mention chat also allows bot authors only there. See
[Live-Testing](memory/vault/03-Architecture/Live-Testing.md).

Discord replaces the whole global command set with one bulk overwrite. Keystone
fetches the server set at ready and only clears + re-registers when the names
drift; after any change it fetches again and logs missing/extra names. Use
`pnpm commands:resync` when you want the explicit clear → register → verify
cycle. Do not clear on every boot: Discord allows two bulk overwrites per ten
minutes, and a clear followed by a rate-limited register leaves the app with no
commands.

## Architecture

```text
apps/bot        gateway adapter, composition root, dispatch, dev prefix bridge
apps/worker     BullMQ consumer with idempotent handlers
packages/kernel registry · guards · settings · dispatch · budget · ports
packages/db     Drizzle schema, migrations, Postgres repositories
packages/importer  bundles, restore/rollback, importers, drift
packages/cache  Redis cooldowns + explicit in-memory fallback
packages/queue  BullMQ adapter + in-process driver for tests
packages/telemetry  OpenTelemetry wrapper, off by default
packages/config Zod-validated environment
packages/testing token-free fixtures for module authors
modules/        diagnostics, setup, moderation, community, ai
memory/         Obsidian vault + machine state + journal
```

**Dependencies point inward.** A module may depend on the kernel. The kernel
never imports discord.js, Drizzle, BullMQ or Redis. `apps/bot` is the only place
that knows what a Discord interaction looks like; `packages/db` is the only
place that knows Postgres. See [System-Overview](memory/vault/03-Architecture/System-Overview.md).

## Contributing and licence

Start with [Contributing](memory/vault/07-OpenSource/Contributing.md), then
[the module contract](memory/vault/05-Learning/01-the-module-contract.md). Open
an issue with a small spec before writing a large feature; scope control is what
keeps this maintainable. The expected checks are `pnpm check` and a memory
update in the same PR.

**Licence: AGPL-3.0-or-later.** See [`LICENSE`](LICENSE). You may run, study,
share and modify Keystone; if you run a modified version as a network service,
you must offer its source under the same licence. There is no CLA; contributions
are inbound=outbound. A DCO check is planned for the public workflow.

Keystone is a teaching project before it is a product. If an explanation and a
test disagree, the test wins; if this README and `memory/machine/` disagree, the
machine file wins and the README needs a fix.
