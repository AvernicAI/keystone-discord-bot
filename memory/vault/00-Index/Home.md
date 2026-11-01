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
| Understand the 100-command wall | [[Command-Budget]] |
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

- Phase **P6** foundation in repo: Discord OAuth2/PKCE, opaque Postgres-backed
  sessions, BigInt per-guild authorization with a bot-membership check, a
  read-only HTML dashboard and `/api/v1` reads. Settings writes, fleet actions
  and scoped API tokens are next. See [[Dashboard]] and
  [[ADR-0016-dashboard-foundation]].
- Phase **P5** complete in-repo: versioned export/restore with checksum
  verification, 24-hour rollback, deletion receipts, file level importers,
  transcript archives and a read-only drift report.
- **Public release (pass 16):** AGPL-3.0-or-later, README and `AGENTS.md` for
  humans and agents, and a safe drift-only command sync with an explicit
  `pnpm commands:resync` cycle.
- **No paid dependencies:** the project uses public GitHub, Discord, local
  Postgres/Redis/Ollama and free in-process test engines only.
- **Live 2026-11-01:** AI Team#5758 logged in, cleared and re-registered all 10
  commands (then fetched Discord's list to prove it), and qwen3:8b via Ollama
  answered mentions in `#ai-chat`. A dev-only `!` bridge proved `!ping`, `!about`,
  `!ai status`, `!mod history` and `!rank leaderboard` through the real dispatch
  pipeline. Slash execution still needs a human client; the MCP cannot invoke
  application commands.
- Phase **P4.5** made channel obfuscation a typed outcome at every fetch site,
  separated required from optional intents with `INTENT_PROFILE`, and made `/setup`
  name disabled features.
- Phase **P4** shipped the AI layer and the ledger-backed economy hardening.
- Phase **P3** shipped the community suite: leveling, reaction roles, welcome,
  starboard, tickets, giveaways, temp voice, content and seasons.
- 10 of Discord's 100 global commands used; 5 modules registered.
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

## Open questions

[[Open-Questions]] — the licence (AGPL-3.0 recommended), hosted-tier posture and
Activities eligibility. P4.5 and P5 are not blocked by them; the licence blocks
external contributions and P9 launch.
