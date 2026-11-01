# Decision log

Chronological index. ADRs hold the reasoning; this page holds the audit trail,
including the small calls that did not deserve an ADR.

## 2026-10-31 — P0

| # | Decision | Where |
| --- | --- | --- |
| 1 | discord.js v14 behind a thin adapter | [[ADR-0001-discordjs-v14-adapter]] |
| 2 | pnpm monorepo, source exports, no build step yet | [[ADR-0002-monorepo-dev-first]] |
| 3 | Command budget enforced in CI and at boot | [[ADR-0003-command-budget]] |
| 4 | Dual memory: vault + `machine/project.json` | [[ADR-0004-memory-system]] |
| 5 | Module contract instead of a central switch | [[ADR-0005-module-contract]] |
| 6 | Turborepo deferred to P1 | [[Stack-Decisions]] |
| 7 | In-memory settings and cooldowns for P0, behind interfaces | `packages/kernel/src/settings.ts` |
| 8 | One root `tsconfig.json` instead of per-package configs | [[ADR-0002-monorepo-dev-first]] |
| 9 | No `LICENSE` file until Q-1 is answered | [[Open-Questions]] |
| 10 | `packages/testing` is a thin re-export of `@keystone/kernel/testing` | `packages/testing/src/index.ts` |
| 11 | pnpm build-script allow-list uses pnpm 12's `allowBuilds` map in `pnpm-workspace.yaml` (the `package.json` "pnpm" field is no longer read) | [[Security]] |
| 12 | Explicit module array, not glob loading | [[01-the-module-contract]] |
| 13 | `diagnostics` is the reference module and ships with the bot | [[04-Modules/diagnostics/Spec\|Spec]] |

## 2026-11-01 — P2

| # | Decision | Where |
| --- | --- | --- |
| 14 | Cases own one accountability spine for mod, security and later tickets/AI | [[ADR-0007-moderation-capability-port]] |
| 15 | Discord actions sit behind `ModerationActions`; modules never import discord.js | [[ADR-0007-moderation-capability-port]] |
| 16 | Dry-run is the default and still records `alerted` cases | [[04-Modules/moderation/Spec\|Moderation spec]] |
| 17 | Case numbers are allocated by an atomic per-guild counter | `packages/db/src/case-store.ts` |
| 18 | Appeals are append-only events, never edits to the original reason | [[04-Modules/moderation/Teaching\|Moderation teaching]] |
| 19 | Native AutoMod only manages `Keystone ·`-prefixed rules | [[04-Modules/moderation/Spec\|Moderation spec]] |
| 20 | Pglite/recorder proofs are labelled separately from live Discord proofs | [[01-Mission/Status\|Project status]] |

## 2026-11-01 — P3

| # | Decision | Where |
| --- | --- | --- |
| 21 | One `CommunityPort` with a typed store and a Discord action half | [[ADR-0008-community-capability-port]] |
| 22 | XP is a projection over `xp_events`; money is a ledger, never a counter | [[04-Modules/community/Teaching\|Community teaching]] |
| 23 | P3 feature state uses guild-scoped `community_records`; the level/ledger/ticket spine stays typed | `packages/db/src/migrations/0004-community-records.ts` |
| 24 | `/rank`, `/ticket` and `/tools` are the only new roots | [[03-Architecture/Command-Budget\|Command budget]] |
| 25 | Reaction roles ship as buttons first; select menus are an explicit open item | [[04-Modules/community/Status\|Community status]] |
| 26 | Live Discord/gateway claims stay separated from service/PGlite proofs | [[01-Mission/Status\|Project status]] |
| 27 | Select components are structural kernel rows; the adapter alone builds Discord selects | [[ADR-0009-select-rows-and-season-archives]] |
| 28 | Season resets archive profiles and write an idempotency marker before clearing `levels` | [[ADR-0009-select-rows-and-season-archives]] |
| 29 | Sticky deletion is scoped to the message id the bot recorded | [[04-Modules/community/Status\|Community status]] |
| 30 | P3 stays on the three existing roots; new paths are `/tools` and `/rank season` | [[03-Architecture/Command-Budget\|Command budget]] |

## 2026-11-01 — P4

| # | Decision | Where |
| --- | --- | --- |
| 31 | `AiProvider` is a kernel contract; the composition root selects the adapter | [[ADR-0010-ai-provider-and-caps]] |
| 32 | Caps are server-side dollar + request counters, checked before every call | [[ADR-0010-ai-provider-and-caps]] |
| 33 | Prompts/completions have no schema; only aggregate usage is retained | [[ADR-0010-ai-provider-and-caps]] |
| 34 | Server RAG uses a portable exact index; pgvector ANN remains an open gate | [[PGVector-Fleet]] |
| 35 | AI is advisory only; no moderation/action path from the module | [[04-Modules/ai/Spec\|AI spec]] |
| 36 | `/ai` is the only new root; `/ticket summary` reuses the AI port | [[03-Architecture/Command-Budget\|Command budget]] |
| 37 | AI is off by default with a master switch and per-feature switches | [[04-Modules/ai/Status\|AI status]] |
| 38 | Economy balances stay derived from `economy_ledger`; no cached balance column | [[ADR-0011-economy-ledger-and-double-spend]] |
| 39 | `CommunityStore.spend` owns the checked debit; Postgres locks the guild row, in-memory uses one queue | [[ADR-0011-economy-ledger-and-double-spend]] |
| 40 | The Discord interaction id is the idempotency key; daily keeps the UTC day key plus the kernel cooldown | [[ADR-0011-economy-ledger-and-double-spend]] |
| 41 | Insufficient funds, self-pay, bot targets, caps and cooldown refuse explicitly; nothing is silently clamped | [[04-Modules/community/Spec\|Community spec]] |
| 42 | Shop/role purchases grant directly; a failed grant is reported, not queued for review | [[ADR-0011-economy-ledger-and-double-spend]] |
| 43 | The economy reuses `/rank`; the command ledger stays 10/100 | [[03-Architecture/Command-Budget\|Command budget]] |
| 44 | Automatic AI summaries on ticket close are not wired; P4 does not name them, so summaries stay on demand | [[ADR-0011-economy-ledger-and-double-spend]] |

## How to add a decision

1. If it changes the contract, write an ADR with **Alternatives**.
2. If it is small, add a row here with a link to the file it affects.
3. Never delete a row. Superseded decisions stay, marked as such, because the
   history is the teaching material.
