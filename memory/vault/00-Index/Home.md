# Keystone — vault home

An open-source, teach-by-default all-in-one Discord bot.

> **The one-line thesis:** every existing "all-in-one" is a stack of two to four
> half-bots, so we ship the union — free, documented, and built so a stranger can
> extend it in an afternoon.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand why this exists | [[Mission]] · [[North-Star]] |
| Know what we refuse to do | [[Non-Negotiables]] |
| See the order of work | [[Roadmap]] |
| See the whole mission | [[Master-Plan]] · [[Parity-Matrix]] |
| Check what is actually proven | [[01-Mission/Status\|Project status]] |
| Understand the code | [[System-Overview]] · [[Module-Contract]] |
| Understand the 100-command wall | [[Command-Budget]] |
| Add a feature | [[04-Modules/diagnostics/Spec\|Diagnostics spec]] then copy the folder |
| Know what competitors do | [[02-Research/Competitors/MEE6\|MEE6]] · [[Dyno]] · [[Carl-bot]] |
| Know the platform limits | [[Platform-Limits]] |
| Teach or learn | [[Curriculum]] |
| Operate it | [[Release]] · [[Incident]] · [[Token-Leak]] · [[Intent-Review]] |

## Current state

- Phase **P4** complete in-repo: provider abstraction, server-doc RAG, ticket
  deflection, mention-only chat, explanations, summaries, advisory
  classification and hard per-guild caps.
- P4 also hardened the **economy**: balances are sums over the append-only
  `economy_ledger`, transfers/purchases/gambles are idempotent on the interaction
  id, money mutations serialize per guild, and refusals are explicit.
- Phase **P3** community complete in-repo: leveling, button/select reaction
  roles, delayed welcome, starboard overrides, birthdays, suggestions, thread
  tickets, giveaways, temp voice, sticky/content tools, feeds and seasons.
- 10 of Discord's 100 global commands used.
- 5 modules registered (diagnostics, setup, moderation, community, ai).
- Optional services: without `DATABASE_URL`/`REDIS_URL` the bot runs in a logged
  local mode; `/setup` reports which one is live.

Machine truth lives in `memory/machine/project.json`; this page is the map, not
the source of truth.

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

## Open questions

[[Open-Questions]] — art unlicensed, v1 scope, music policy. Nothing below P7 is
blocked by them.
