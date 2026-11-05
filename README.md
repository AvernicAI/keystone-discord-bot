# Keystone

**Keystone** is an open-source, teach-by-default, all-in-one Discord bot. The
name is the bot and the project: one foundation that moderation, community,
tickets, economy and AI all stand on.

**Repository:** https://github.com/RNGBubba/keystone-discord-bot

> Every "all-in-one" bot today is two to four half-bots stapled together.
> Keystone ships the union — free, documented, and built so a stranger can add a
> feature in an afternoon.

**Current facts:** **20/100 roots** · **141 real subcommands** · **161 actions** ·
**4 context menus** · **12 modules** · **644 tests across 94 files**. The full
gate is token-free.

This repo is both the product and the course: every module has a spec, tests, a
teaching note and a status page. The docs are the source of truth, not a
marketing site.

---

## Why Keystone

- **One record.** Moderation cases, tickets, levels, economy, invites, forms,
  events and modmail share one guild-scoped store instead of five half-bots.
- **Free forever.** Every shipped feature is free on every server. No feature is
  moved behind a paywall, and no limit exists only to sell an upgrade.
- **Provable and portable.** Every action can be explained, every setting has an
  audit row, and a guild can export its own record with a checksum.

## Quickstart

```bash
git clone https://github.com/RNGBubba/keystone-discord-bot.git
cd keystone-discord-bot
corepack enable
pnpm install
cp .env.example .env
```

Put `DISCORD_TOKEN` in `.env`. `pnpm dev` boots a working bot in memory mode —
no Postgres or Redis required. State resets on restart.

### Full local stack

```bash
docker compose up -d postgres redis
pnpm db:migrate          # explicit and idempotent; never on boot
pnpm dev                 # bot
pnpm worker:dev          # second terminal: BullMQ consumer
pnpm web:start           # third terminal: dashboard/API at :3000
```

A gateway-only host can run `docker compose up --build bot worker`. With
`SESSION_SECRET` set, `docker compose up --build` also starts the optional web
service. `pnpm db:migrate` is safe to rerun.

### Verify without secrets

```bash
pnpm check
```

Typecheck, the full test suite, the command-budget audit, the intent and channel
audits, and the memory consistency check all run without a Discord token, a
database or the network.

## Discord app setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. **Bot** → reset/copy the token. Never commit `.env`.
3. **Bot** → enable **Server Members** and **Message Content** for the full
   profile. Without them, set `INTENT_PROFILE=minimal`; `/setup` names the
   disabled features.
4. **OAuth2** → copy the Client ID and Secret and add the exact redirect
   `http://localhost:3000/auth/callback` for the dashboard.
5. Invite the bot with `bot` and `applications.commands`. `Administrator` is the
   simplest first run; the README's least-privilege list is in
   [`.env.example`](.env.example) and the vault.

`/setup` is the first command to run.

## What is inside

| Module | Roots | What it owns |
| --- | --- | --- |
| Diagnostics | `/ping`, `/about`, `/help` | Liveness, version, the generated command catalog |
| Setup | `/setup`, `/config`, `/export` | Readiness, module switches, in-bot settings, bundles and drift |
| Moderation | `/mod`, `/appeal`, `/verify` | Cases, evidence, dry-run automod, appeals and the join gate |
| Community | `/rank`, `/ticket`, `/tools` | XP, economy, tickets, reaction roles, giveaways, feeds, temp voice |
| AI | `/ai` | Opt-in, capped, zero-retention answers with citations |
| Invites | `/invites` | Attribution, joins/retention and advisory fake-join flags |
| Logging | `/logging` | One append-only audit ledger with retention and export |
| Analytics | `/analytics` | Read-only aggregates over the bot's existing ledgers |
| Music | `/music` | A durable saved queue; playback is BYO Lavalink and refuses clearly |
| Forms | `/form` | Applications, modal or answers-option submission, review and export |
| Events | `/event` | Draft/open/closed lifecycle, RSVPs, capacity and reminders |
| Modmail | `/modmail` | Private member-to-staff threads, claims and archived transcripts |

Each module has a spec, status and teaching note under
[`memory/vault/04-Modules/`](memory/vault/04-Modules/). The honest per-row status
is generated in [Feature-Status.md](memory/vault/01-Mission/Feature-Status.md).

## Commands

Discord allows 100 global chat-input commands and 15 + 15 context menus.
Keystone uses **20 roots** and **141 subcommands**, so a subcommand costs no
global slot. Four context menus — `Report message`, `Case history`, `Rank card`
and `Explain with AI` — sit on the separate menu budget.

| Root | Subs | What it does |
| --- | ---: | --- |
| `/ping` | — | Confirm the gateway is alive and show uptime |
| `/about` | — | Version, module state, teaching link |
| `/help` | 5 | Browse and search the generated catalog, privacy, changelog |
| `/setup` | 5 | Readiness, module switchboard, integrity check, preview, reset |
| `/config` | 4 | Read or change any module's settings through its own Zod schema |
| `/export` | 6 | Download, preview, restore, delete, drift and rollback |
| `/mod` | 16 | Cases, bans, timeouts, purge, locks, filters, reviews, panic |
| `/appeal` | 2 | Open an appeal, or read its append-only events and case state |
| `/verify` | 2 | Start the DM verifier from a quarantined row, or read status |
| `/rank` | 12 | XP, levels, ledger-backed currency, shop and seasons |
| `/ticket` | 8 | Thread tickets, claims, transcripts, summaries and SLA stats |
| `/tools` | 25 | Embeds, tags, reminders, giveaways, polls, feeds, roles, responders |
| `/ai` | 11 | Status, chat, classify, docs, deflection, explanations, budgets |
| `/invites` | 3 | Leaderboard, stats and who invited a member |
| `/logging` | 7 | Channel, event toggles, retention, status, export, disable |
| `/analytics` | 6 | Overview, members, messages, commands, tickets, export |
| `/music` | 8 | Play, queue, add, remove, clear, skip, stop, status |
| `/form` | 8 | Create, edit, delete, list, panel, submit, review, export |
| `/event` | 7 | Create, edit, delete, list, rsvp, remind, export |
| `/modmail` | 6 | Setup, open, reply, close, transcript, stats |

`pnpm commands:catalog` regenerates the full per-root list in
[Command-Catalog.md](memory/vault/01-Mission/Command-Catalog.md); `/help` reads
the same live registry. Command sync only clears and re-registers when the name
or option tree drifts. `pnpm commands:doctor` is the read-only check;
`pnpm commands:resync` is the deliberate clear → register → verify cycle.

## Configuration

All values are validated by `packages/config`. `.env.example` is the only
committed environment shape; never put secrets in a Discord message or the vault.

| Variable | Required | Effect when absent |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | The bot refuses to start |
| `INTENT_PROFILE` | no | `full` requests privileged intents; `minimal` runs the core |
| `DATABASE_URL` | production | Settings are process-local and reset on restart |
| `REDIS_URL` | production | Cooldowns are local; jobs run inside the bot process |
| `AI_API_KEY` / `AI_BASE_URL` | no | `/ai` says `unconfigured`; calls refuse safely |
| `DEV_GUILD_ID` | dev only | Seeds AI chat and enables the `!` bridge in that guild |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | dashboard | `/login` returns `503`; the bot is unaffected |
| `SESSION_SECRET` | production web | The web process refuses to boot without it |

See [`.env.example`](.env.example) for the complete list and
[configuration notes](memory/vault/03-Architecture/System-Overview.md).

## Dashboard and API

The optional `apps/web` process is a security-first, framework-free Node app:
Discord OAuth2/PKCE, opaque Postgres sessions, per-guild BigInt authorization,
schema-generated settings widgets, audited writes, saved templates, bounded
analytics, scoped API tokens, signed webhooks and `Idempotency-Key` replay.

```text
GET  /healthz                               public, no secrets
GET  /login, /auth/callback                 OAuth2 code + PKCE, state and iss checks
GET  /dashboard, /dashboard/fleet           manageable servers and fleet templates
GET  /dashboard/guilds/:id                  overview, settings, analytics, drift
GET  /api/v1/...                            reads and a schema-validated settings PATCH
```

Every guild route checks both the OAuth user and the bot's membership. The
`:guildId` in a URL is never trusted. A live Discord OAuth round trip is still
open; the read/write path is proven over real local HTTP and Postgres. See
[Dashboard](memory/vault/03-Architecture/Dashboard.md).

## Proof

- `pnpm check` covers **644 tests across 94 files**, 35/35 claim checks and
  4,886 memory checks without a token, database or network.
- `pnpm probe:live` is **28/28** on the local stack: SQL, Redis, the queue,
  settings survival, temporary expiry, scheduled delivery, portability, web and
  signed component interactions.
- **Docker Desktop 29.9.2** runs the repo's compose Postgres 16.15 and Redis.
  Machine evidence lives in [`live.json`](memory/machine/live.json).
- What is not proven live is named in [Status.md](memory/vault/01-Mission/Status.md):
  a human slash invocation, right-click, member join/leave and a live Discord
  OAuth round trip still need a real client.

No feature is claimed live because it has a test. The evidence rules are in
[Memory-Audit-2026-11-03.md](memory/vault/01-Mission/Memory-Audit-2026-11-03.md).

## Memory and teaching

- [`AGENTS.md`](AGENTS.md) is the five-minute read order and the non-negotiables.
- `memory/machine/` is machine truth: phase, modules, features, passes, research.
- `memory/vault/` is the Obsidian vault; open `memory/vault/00-Index/Home.md`.
- `memory/journal/` holds one entry per pass, including what was tried and
  rejected.
- [Curriculum.md](memory/vault/05-Learning/Curriculum.md) is the 14-lesson
  course; every lesson is checked against the current code.
- [Roadmap-v3.md](memory/vault/01-Mission/Roadmap-v3.md) is the proposed
  long-term plan; [Parity-Matrix.md](memory/vault/01-Mission/Parity-Matrix.md) is
  the feature-by-feature comparison.

`pnpm memory:render` regenerates pages from machine truth. `pnpm memory:check`
validates the machine files, generated pages and every wikilink. Never hand-edit
a page that says "generated by pnpm memory:render".

## How to add a module

Read [Module-Contract.md](memory/vault/03-Architecture/Module-Contract.md) and
copy `modules/diagnostics` as the smallest working template.

1. Create `modules/<feature>/` with the same package shape.
2. Export a `defineModule({...})` manifest with `settingsSchema`,
   `defaultSettings`, commands, intents and `docsPath`.
3. Use `defineCommand({...})`; prefer real subcommands over a flat `action`
   option. Check `pnpm budget` before adding a root.
4. Put side effects behind a kernel port. Modules must not import discord.js,
   Drizzle, BullMQ or Redis; Discord lives in `apps/bot`.
5. Add token-free tests, a spec, a status page and a teaching note. Then run
   `pnpm commands:catalog && pnpm memory:render && pnpm check`.

## Contributing and licence

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then the
[module contract](memory/vault/05-Learning/01-the-module-contract.md) and
[Contributing](memory/vault/07-OpenSource/Contributing.md). Governance is
[GOVERNANCE.md](GOVERNANCE.md), conduct is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
and vulnerabilities go through [SECURITY.md](SECURITY.md) — never a public issue.

**No paid dependencies.** Keystone must stay runnable on free/local services:
public GitHub, Discord, Postgres, Redis, Ollama, PGlite and in-memory adapters.
Never add a paid GitHub plan/feature or another paid service to make a feature
work; see [Non-Negotiables](memory/vault/01-Mission/Non-Negotiables.md).

**Licence: AGPL-3.0-or-later.** See [`LICENSE`](LICENSE). There is no CLA;
contributions are inbound=outbound. If an explanation and a test disagree, the
test wins; if this README and `memory/machine/` disagree, the machine file wins
and the README needs a fix.
