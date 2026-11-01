# Keystone

**Keystone** is an open-source, teach-by-default, all-in-one Discord bot. The
name is the bot and the project: one foundation that moderation, community,
tickets, economy and AI all stand on.

**Repository:** https://github.com/RNGBubba/keystone-discord-bot

> Every "all-in-one" bot today is two to four half-bots stapled together.
> Keystone ships the union — free, documented, and built so a stranger can add a
> feature in an afternoon.

**Status:** P0–P5 are complete in-repo. P6's **authorization and settings-write
foundation** is now in repo: Discord OAuth2/PKCE login, opaque Postgres-backed
sessions, per-guild BigInt authorization, schema-validated module settings writes
from the dashboard and a `PATCH /api/v1` route. Fleet actions, templates, scoped
API tokens and webhooks are the remaining P6 work. P7 invite tracking is now in
repo as a sixth module: attribution, a joins/retention leaderboard and advisory
suspicious-join flags. The command ledger is **11/100**, there are **6 modules**,
and `pnpm check` covers **208 tests across 35 files** without a Discord token,
database or network. Live on 2026-11-01: the bot logged in, registered 11 commands
through Discord, answered a Qwen3:8b mention in `#ai-chat`, and ran real
moderation, community, AI and invite commands through a development message
bridge. The dashboard was booted in memory mode and
exercised over real HTTP, including authenticated settings writes against a fake
OAuth port; live Discord OAuth is not claimed. Slash `InteractionCreate` from a
human client is still the next live check.

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
- [Dashboard and API](#dashboard-and-api)
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

- A Discord OAuth2 client for the dashboard. Without it, `pnpm web:start` still
  boots and `/healthz` works, but `/login` returns `503`; no other feature is
  affected.
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
pnpm web:start           # third terminal: dashboard/API at http://localhost:3000
```

`pnpm db:migrate` is safe to rerun. Postgres data lives in the `pgdata` volume.

### 4. All-in-one Docker

```bash
docker compose up --build
```

This builds the bot, runs migrations once, then starts the bot, worker and web
service. `docker compose up -d postgres redis` is the lighter path when you want
hot reload with `pnpm dev`; the web service is optional, so a gateway-only
self-host can omit it or run `docker compose up bot worker` without a dashboard.

### 5. Dashboard and API (optional)

```bash
pnpm web:start           # http://localhost:3000
```

Memory mode works without Postgres, Redis or OAuth: `/healthz` reports
`{"database":"memory","oauth":false}` and `/login` returns `503`. To sign in,
create a Discord OAuth2 client (see [Discord app setup](#discord-app-setup)) and
set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and
`DISCORD_OAUTH_REDIRECT_URI`, plus `SESSION_SECRET` in production. The dashboard
only lists servers where you are owner or hold **Administrator** / **Manage
Server**, and the bot must be in the server.

### 6. Verify without secrets

```bash
pnpm check
```

This runs typecheck, the full test suite, the command-budget audit, the intent
and channel audits, and the memory consistency check. It must stay green in CI
without a token or network.

### 7. Register or refresh Discord commands

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
4. **OAuth2** → **General**: copy the Client ID and Client Secret, and add the
   exact redirect `http://localhost:3000/auth/callback` (use your
   `WEB_ORIGIN` when it differs). The dashboard needs the `identify guilds`
   scope; it never asks for your bot token.
5. **OAuth2** → URL Generator:
   - Scopes: `bot`, `applications.commands`.
   - Permissions: for a first run, **Administrator** is simplest. Least privilege:
     `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`,
     `Use Application Commands`, `Manage Roles`, `Manage Channels`,
     `Manage Messages`, `Add Reactions`, `Create Public Threads`,
     `Manage Threads`, `Connect`, `Moderate Members`, `Ban Members`,
     `Kick Members`.
6. Invite the bot, then start it as above. `/setup` is the first command to run.

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
| `WEB_PORT` | no | Dashboard/API port; defaults to `3000` |
| `WEB_ORIGIN` | production | Public origin used for the redirect/cookie mode; defaults to `http://localhost:$WEB_PORT` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | dashboard | Without them `/login` returns `503`; the bot is unaffected |
| `DISCORD_OAUTH_REDIRECT_URI` | dashboard | Must match the Developer Portal exactly; defaults to `$WEB_ORIGIN/auth/callback` |
| `DISCORD_OAUTH_ISSUER` | no | Defaults to `https://discord.com`; the callback rejects any other `iss` |
| `SESSION_SECRET` | production web | 32 bytes base64/base64url or 64 hex; the process refuses to boot in production without it |

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

Discord's global limit is 100; Keystone uses **11**. Slash commands are the
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
| `/invites` | `leaderboard`, `stats`, `who`, `user`, `limit` | Invite attribution, joins/retention totals and who invited a member |

`/ticket summary` and `/ai summary` require `ManageGuild`. `/ai docs-*` and
`/ai budget` require `ManageGuild`; `/ai classify` and `/ai deflect` require
`ManageMessages`. AI is advisory: it never punishes, deletes or claims an action
happened.

## Dashboard and API

The P6 foundation is a separate, optional Node process in `apps/web`. It is
**security-first**: login, per-guild authorization and a small, schema-validated
settings write path.

```text
GET /healthz                              public, no secrets
GET /login                                OAuth2 code + PKCE; 503 without OAuth config
GET /auth/callback                        state + iss validation, then a session
GET /dashboard                            servers the user can manage
GET /dashboard/guilds/:id                 guild overview
GET /dashboard/guilds/:id/settings/:module  settings editor for one module
POST /dashboard/guilds/:id/settings/:module  save the form (CSRF + schema)
GET /api/v1/me                            signed-in user, never a token
GET /api/v1/guilds                        manageable servers only
GET /api/v1/guilds/:id/overview           counts, module settings, latest import
PATCH /api/v1/guilds/:id/settings/:module  update one module (CSRF + schema)
POST /logout                              session + CSRF; deletes the server-side session
```

Every guild route performs **two checks**: the OAuth user must be owner or hold
`ADMINISTRATOR` / `MANAGE_GUILD` (parsed as `BigInt`, because bit 40 is
`MODERATE_MEMBERS`), **and** the bot token must confirm the bot is in the guild.
The `:guildId` in a URL is never trusted. Sessions are opaque random values;
only their SHA-256 hash is stored. The Discord access token is AES-256-GCM
sealed before it reaches Postgres and never appears in HTML or JSON. No refresh
token is stored: refresh is still open, so a session re-authenticates when its
Discord access token expires. Responses carry a strict
CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and
`Cache-Control: no-store`.

Settings writes are deliberately narrow: only modules already registered in the
bot can be edited, and the value is parsed by that module's own Zod schema through
`SettingsService.update` before it is stored. Unknown keys are ignored, invalid
values return `400` without a write, and both the HTML form and the API require
the session's CSRF token. The API takes the session cookie plus
`x-keystone-csrf` (the value of the `keystone_csrf` cookie); the HTML form carries
the same token in a hidden field. A missing token is `403`. The editor is a JSON
textarea because P6 has not built schema-driven fields yet; it edits real
settings, not a second configuration store.

This is a foundation, not the P6 exit demo. Still open: schema-driven field
widgets, the fleet view/templates, token refresh and revocation, public scoped
API tokens, per-token rate limits, `Idempotency-Key`, webhooks, OpenAPI, and a
live OAuth round trip against Discord. See
[Dashboard](memory/vault/03-Architecture/Dashboard.md) and
[ADR-0016](memory/vault/03-Architecture/ADR/ADR-0016-dashboard-foundation.md).

## Features

Everything below is free. No feature is moved behind a paywall.

### Platform and operations

- Module registry with a CI-enforced 100-command budget (currently 11).
- Postgres schema and ordered migrations; Drizzle repositories.
- Redis cooldowns and a BullMQ worker, with explicit in-memory fallbacks.
- OpenTelemetry tracing, off by default.
- Required vs optional gateway intents (`INTENT_PROFILE`) and a `/setup`
  capability report.
- One channel resolver for Discord's 2026 channel-obfuscation rollout.
- Versioned export bundle, checksum verification, transactional restore,
  24-hour rollback, deletion receipts, importers and a read-only drift report.
- P6 dashboard/API foundation: Discord OAuth2/PKCE, opaque Postgres sessions,
  per-guild BigInt authorization, a read-only overview, module settings writes
  through the bot's own schemas, and `/api/v1` reads plus a settings `PATCH`.
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
- Button and select reaction roles, welcome and delayed autoroles.
- Starboard with per-channel overrides and sticky messages.
- Invite tracking: attribution from cached invite counters when a baseline
  exists (a cold cache records an unknown inviter rather than guessing), a
  joins/retention leaderboard, and advisory flags for new or avatar-less
  accounts. No punishment is attached to a flag.
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

- **P6 remaining:** schema-driven field widgets, the Next.js shell, fleet
  view/templates, token refresh/revocation, scoped public API tokens,
  per-token rate limits, idempotency, webhooks and OpenAPI.
- **P7:** invite tracking is done; the rest is parity completion (forms,
  events, role persistence, modmail, auto-responders, analytics), Components V2
  UI and i18n.
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
| P6 Dashboard + API | **In progress** | OAuth/PKCE sessions, per-guild authz, schema-validated settings writes and `/api/v1` |
| P7 Parity completion | **In progress** | Invite tracking shipped; forms, events, expiry, modmail and UI/i18n open |

Live evidence (2026-11-01): `AI Team#5758` connected, cleared and re-registered
11 global commands (including `/invites`), and Qwen3:8b answered a mention in
`#ai-chat`. A development `!` bridge ran `!ping`, `!about`, `!ai status`,
`!mod history`, `!rank leaderboard`, `!invites leaderboard` and `!invites who`
through the real dispatch pipeline. `/ticket stats` reached
the `ManageGuild` guard (the MCP bot is not an admin); that check exposed a real
ordering bug, now fixed and unit-tested.

P6 web evidence (2026-11-01): the dashboard process booted in memory mode and
real HTTP requests returned `/healthz` `200`, `/` `200`, `/api/v1/nope` `404` and
`/login` `503` with the OAuth-unconfigured message. The authenticated read and
write flows are proven against a real local HTTP server with a fake OAuth port:
`PATCH /api/v1/guilds/:id/settings/:module` and the HTML form persist real module
settings through `SettingsService`, invalid values are rejected without a write,
and cross-guild, non-admin, bot-absent and missing-CSRF writes return `403`/`400`.
A live Discord login and a Postgres session are not claimed.

Still open and not claimed as done:

- Slash `InteractionCreate` from a human client (the MCP cannot invoke it).
- Live Postgres, live role grants, live selects/voice/scheduler and a human
  mention in production.
- pgvector ANN at 1M×1536 with production embeddings; the exact index is the
  portable path today.
- MEE6 import is file-based, not a live fetch.
- Live Discord OAuth, a Postgres-backed session smoke, fleet actions and scoped
  API tokens are the remaining P6 work.

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
6. Add the manifest to `packages/module-catalog/src/index.ts` (the one list
   shared by the bot and the dashboard), then run:

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

A new module's settings editor appears in the dashboard automatically because the
web app reads the same `settingsSchema` from the shared catalog. Do not add a
web-only schema or a second write path: use `SettingsService.update` and the
module's existing defaults.

If the feature needs a database table, add a migration in
`packages/db/src/migrations` and a repository; if it needs a Discord permission,
declare it on the manifest. If it needs a new root command, check the budget
first: eleven roots are used, eighty-nine remain, and every root is a permanent
public interface.

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
apps/web        optional dashboard/API: OAuth sessions, guild authz, settings writes
packages/kernel registry · guards · settings · dispatch · budget · ports
packages/module-catalog  the one module list shared by bot and web
packages/db     Drizzle schema, migrations, Postgres repositories
packages/importer  bundles, restore/rollback, importers, drift
packages/cache  Redis cooldowns + explicit in-memory fallback
packages/queue  BullMQ adapter + in-process driver for tests
packages/telemetry  OpenTelemetry wrapper, off by default
packages/config Zod-validated environment
packages/testing token-free fixtures for module authors
modules/        diagnostics, setup, moderation, community, ai, invites
memory/         Obsidian vault + machine state + journal
```

**Dependencies point inward.** A module may depend on the kernel. The kernel
never imports discord.js, Drizzle, BullMQ or Redis. `apps/bot` is the only place
that knows what a Discord interaction looks like; `packages/db` is the only
place that knows Postgres. Gateway state gets its own owner where it has real
logic: invite events are translated by `invite-events.ts` and the cache/queue
live in `invite-tracker.ts`. See [System-Overview](memory/vault/03-Architecture/System-Overview.md).

## Contributing and licence

Start with [Contributing](memory/vault/07-OpenSource/Contributing.md), then
[the module contract](memory/vault/05-Learning/01-the-module-contract.md). Open
an issue with a small spec before writing a large feature; scope control is what
keeps this maintainable. The expected checks are `pnpm check` and a memory
update in the same PR.

**No paid dependencies.** Keystone must stay runnable on free/local services:
public GitHub, Discord, Postgres, Redis, Ollama, PGlite and in-memory adapters.
Never add a paid GitHub plan/feature or another paid service to make a feature
work; see [Non-Negotiables](memory/vault/01-Mission/Non-Negotiables.md#8-nothing-that-costs-money).

**Licence: AGPL-3.0-or-later.** See [`LICENSE`](LICENSE). You may run, study,
share and modify Keystone; if you run a modified version as a network service,
you must offer its source under the same licence. There is no CLA; contributions
are inbound=outbound. A DCO check is planned for the public workflow.

Keystone is a teaching project before it is a product. If an explanation and a
test disagree, the test wins; if this README and `memory/machine/` disagree, the
machine file wins and the README needs a fix.
