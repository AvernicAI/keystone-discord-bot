# Keystone — vault home

An open-source, teach-by-default all-in-one Discord bot.

> **The one-line thesis:** every existing "all-in-one" is a stack of two to four
> half-bots, so we ship the union — free, documented, and built so a stranger can
> extend it in an afternoon.

**Public repository:**
https://github.com/RNGBubba/keystone-discord-bot

## Start here

| If you want to… | Read |
| --- | --- |
| Understand why this exists | [[Mission]] · [[North-Star]] |
| Know what we refuse to do | [[Non-Negotiables]] |
| See the order of work | [[Roadmap]] |
| See the whole mission | [[Master-Plan]] · [[Parity-Matrix]] |
| Check what is actually proven | [[01-Mission/Status\|Project status]] |
| Understand the code | [[System-Overview]] · [[Module-Contract]] · [[Live-Testing]] |
| Understand the 100-command wall | [[Command-Budget]] · [[Command-Catalog]] |
| Add a feature | [[04-Modules/diagnostics/Spec\|Diagnostics spec]] then copy the folder |
| Know what is actually shipped | [[Feature-Status]] · [[Pass-Ledger]] |
| Know what competitors do | [[02-Research/Competitors/MEE6\|MEE6]] · [[Dyno]] · [[Carl-bot]] · [[Competitive-2026]] |
| Know the platform limits | [[Platform-Limits]] · [[Platform-2026]] |
| Know what can be imported | [[Import-Formats]] · [[Migration-Guides]] |
| Export, restore or delete a guild | [[Portability]] · [[Portability-Runbook]] |
| Know the dashboard security contract | [[Dashboard-Security]] · [[Dashboard]] |
| Know the evidence | [[Claims]] · [[02-Research/OSS-2026\|OSS-2026]] · [[User-Voice-2026]] |
| Teach or learn | [[Curriculum]] |
| Operate it | [[Release]] · [[Incident]] · [[Token-Leak]] · [[Intent-Review]] |

## Current state

- Phase **P7** has started: invite tracking is the sixth module. It records
  attribution by diffing cached invite counters when a baseline exists (a cold
  cache records no inviter), stores joins/leaves in `invite_joins`, exposes
  `/invites leaderboard | stats | who`, and flags new or avatar-less accounts as
  advisory evidence only. The gateway state (cache, per-guild join queue) is
  owned by `apps/bot/src/invite-tracker.ts`; `invite-events.ts` only translates
  discord.js events. See [[04-Modules/invites/Spec|Invites spec]].
- **Content filters** in repo: the link/phishing filter (pass 23) uses a local
  host blocklist plus punycode detection; the profanity/zalgo filter (pass 24)
  uses an operator-owned word list on Unicode word edges plus a combining-mark
  threshold. Both support `alert` or `delete`; `/mod links` and `/mod filters`
  are the review queues. A dev-only `keystone-test:` marker makes the MCP proof
  possible. Live: link, delete, profanity and zalgo cases; `!mod filters` listed
  them and `!mod review` closed one; `example.com` produced no case. Pass 25
  also removed a profanity fixture in `delete` mode while keeping its case. See
  [[04-Modules/moderation/Spec|Moderation spec]].
- **Auto-responder** in repo (pass 25): exact, contains and regex triggers in
  the community record seam, one reply per message (exact beats contains, then
  regex), and a per-trigger cooldown. `/tools responder`, `/tools responders` and
  `/tools responder-remove` configure it under the existing root. Live:  the `hello keystone` trigger replied, a second message inside 60 seconds did not,
  and a third after the window did. See
  [[04-Modules/community/Spec|Community spec]].
- **Audit logging** in repo (pass 28): `/logging setup | channel | events |
  status | retention | export | disable` captures message delete/edit, member
  join/leave and moderation cases in one operator channel and an append-only
  `logging_events` ledger with a 1–365 day retention window. Events are stored
  before delivery, so a broken channel keeps the history. Live: a real edit and
  delete produced embeds with before/after content, a moderation case arrived
  through the case observer, and `!logging status | events | retention | export`
  ran through the real bridge. Member events are adapter-tested only. See
  [[04-Modules/logging/Spec|Logging spec]].
- **Command tree** in repo (pass 26): real Discord subcommands replaced the flat
  `action` option across every existing hub — 13 roots, 84 subcommands, 97
  actions. `/help` is generated from the live registry; `pnpm commands:catalog`
  writes [[Command-Catalog]] and `pnpm commands:doctor` checks the live shape.
  A human slash invocation remains the one unobserved surface.
- Phase **P6** foundation in repo: Discord OAuth2/PKCE, opaque Postgres-backed
  sessions, BigInt per-guild authorization with a bot-membership check, a
  server-rendered dashboard, `/api/v1` reads and schema-validated module settings
  writes from the HTML form and a CSRF-protected `PATCH`. Field widgets, fleet
  actions and scoped API tokens are still open. See [[Dashboard]] and
  [[ADR-0016-dashboard-foundation]].
- Phase **P5** complete in-repo: versioned export/restore with checksum
  verification, 24-hour rollback, deletion receipts, file level importers,
  transcript archives and a read-only drift report.
- **Public release (pass 16):** AGPL-3.0-or-later, README and `AGENTS.md` for
  humans and agents, and a safe drift-only command sync with an explicit
  `pnpm commands:resync` cycle.
- **No paid dependencies:** the project uses public GitHub, Discord, local
  Postgres/Redis/Ollama and free in-process test engines only.
- **Slash harness (pass 27):** a nested `/mod ban` payload crosses the real
  adapter and dispatch and creates a case; this is structural, not a gateway
  `InteractionCreate`. Two live bot process trees were found double-posting and
  stopped, leaving one bot and one reply per command. The updated `.env` points
  at localhost Postgres/Redis, but neither service is installed here, so the live
  window remains memory mode.
- **Live 2026-11-01:** AI Team#5758 logged in, cleared and re-registered 13
  roots with 84 subcommands (then fetched Discord's shape to prove it), and
  qwen3:8b via Ollama answered mentions in `#ai-chat`. A dev-only `!` bridge
  proved `!ping`, `!about`, `!help commands`, `!help browse`, `!help search
  query=ban`, `!ai status`, `!mod history`, `!mod links`, `!mod filters`,
  `!rank leaderboard`, `!invites leaderboard`, `!invites who`, `!logging status`,
  `!logging events`, `!logging retention` and `!logging export` through the real
  dispatch pipeline. Audit logging also delivered live message-edit,
  message-delete and moderation-case embeds to the configured channel. The content filters produced live link, delete, profanity
  and zalgo cases; `!mod filters` listed them, `!mod review` closed one, and
  `example.com` produced none. The auto-responder trigger replied, its cooldown
  suppressed a second reply, then released. Slash execution still needs a human
  client; the MCP cannot invoke application commands or render embeds.
- Phase **P4.5** made channel obfuscation a typed outcome at every fetch site,
  separated required from optional intents with `INTENT_PROFILE`, and made `/setup`
  name disabled features.
- Phase **P4** shipped the AI layer and the ledger-backed economy hardening.
- Phase **P3** shipped the community suite: leveling, reaction roles, welcome,
  starboard, tickets, giveaways, temp voice, content and seasons.
- 13 of Discord's 100 global roots used, with 84 subcommands; 7 modules registered.
- The full suite covers the 5,000-row portability round trip and the failure,
  rollback and deletion paths; `pnpm check` also runs the intent, channel and
  memory audits.
- Optional services: without `DATABASE_URL`/`REDIS_URL` the bot runs in a logged
  local mode; `/setup` reports which one is live.

Machine truth lives in `memory/machine/project.json` and the generated
[[Feature-Status]]; this page is the map, not the source of truth.

## The decision log

- [[ADR-0001-discordjs-v14-adapter]] — discord.js v14 behind a thin adapter
- [[ADR-0002-monorepo-dev-first]] — pnpm monorepo, no build step in the loop
- [[ADR-0003-command-budget]] — the budget is a CI gate, not a guideline
- [[ADR-0004-memory-system]] — two halves, checked against each other
- [[ADR-0005-module-contract]] — folders, not switches
- [[ADR-0006-ports-and-adapters]] — Postgres, Redis and BullMQ behind ports
- [[ADR-0007-moderation-capability-port]] — cases and Discord actions behind ports
- [[ADR-0008-community-capability-port]] — one community port over typed data and actions
- [[ADR-0009-select-rows-and-season-archives]] — select menus and non-destructive season resets
- [[ADR-0010-ai-provider-and-caps]] — provider abstraction, hard guild caps and zero retention
- [[ADR-0011-economy-ledger-and-double-spend]] — derived balances, guild lock and idempotent money
- [[ADR-0012-required-and-optional-intents]] — required/optional intents and one channel resolver
- [[ADR-0013-roadmap-v2-portability-first]] — P4.5–P10, portability before dashboard
- [[ADR-0014-memory-v2-machine-truth]] — machine files, generated Markdown, CI drift check
- [[ADR-0015-portability-bundles-and-receipts]] — checksum bundles, transactional restore, narrow merge, receipts
- [[ADR-0016-dashboard-foundation]] — framework-free HTTP, opaque sessions, per-guild authz first
- [[ADR-0017-invite-tracking]] — diff cached invite counters, store joins, advisory flags only

## Open questions

[[Open-Questions]] — the licence (AGPL-3.0 recommended), hosted-tier posture and
Activities eligibility. P4.5 and P5 are not blocked by them; the licence blocks
external contributions and P9 launch.
