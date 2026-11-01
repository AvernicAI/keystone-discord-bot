# Project status

## Now

**P4 is complete in-repo** (passes 08–09, 2026-11-01): the AI layer and the
ledger-backed economy hardening. Live provider calls, Discord mention events,
thread sends and role grants are still unverified. The pgvector ANN benchmark is
partial. P5 is next. Nothing is committed or pushed; the repository is a local
working tree.

## Gate

```
pnpm check        typecheck 0 · 129 tests / 23 files · budget 10/100 · memory 72/72
pnpm build        exit 0 from a removed dist; bot, worker and migrate artefacts
```

A local `.env` exists in the working tree. Smoke commands pin
`DOTENV_CONFIG_PATH=.env.absent` so the result is deterministic and does not
read that file.

## P3 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Every named P3 feature exists | `community.test.ts`, `extras.test.ts`: XP, economy, welcome/delayed autorole, button/select roles, starboard overrides, birthdays, suggestions, giveaways, temp voice, tickets, content, sticky and seasons | In-memory port + recording actions |
| 2 | XP as a projection, money as a ledger | 30 P3 tests; duplicate message ids award zero; duplicate ledger keys insert once; balance is a sum; shop/daily/transfer/gamble paths | In-memory + **PGlite** |
| 3 | Thread ticket lifecycle | `community.test.ts`: panel button, thread open, one-open cap, claim, transcript, close, stats | Recorder; adapter typechecks only |
| 4 | Safety paths | Giveaway duplicate entry/early end refused; duplicate votes/sticky/birthday/season are no-ops; unmanaged select role rejected; temp voice non-owner does not delete | Service tests |
| 5 | Command budget | `pnpm budget`: `/rank`, `/ticket`, `/tools` make 10/100, under P3's 20-root ceiling | Static registry |
| 6 | Persistence | `packages/db/src/community.test.ts`: XP idempotency, ledger transfer, ticket events, record scoping/delete and transactional season archive on PGlite | PGlite, not a Postgres server |
| 7 | Records | this page, [[Roadmap]], [[Parity-Matrix]], [[04-Modules/community/Status|community status]], [[ADR-0008-community-capability-port]], [[ADR-0009-select-rows-and-season-archives]], pass 07 | Vault check |

P3 follow-ups are now green in-repo: birthdays, suggestions, select-menu and
multi-role reaction roles, per-channel starboard overrides, delayed autorole,
sticky messages and seasonal XP reset all have admin paths and regression tests.
The full matrix is still not fully green because goodbye messages,
YouTube/Twitch-specific feeds, MEE6 import (P5) and live Discord verification
remain open.

## P4 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Provider abstraction with no vendor SDK in a module | `modules/ai/src/provider.test.ts`: unconfigured, OpenAI-compatible request/auth/cost, HTTP 429 | Fake fetch + deterministic provider; no network |
| 2 | Hard per-guild dollar and request cap | `modules/ai/src/ai.test.ts`: `$0.01` cap allows one `$0.01` call, refuses the next before the provider; request cap same | In-memory usage + counting provider |
| 3 | Zero prompt/completion retention | Same suite: usage has only six counter fields; migration 0005 has no prompt/completion columns | In-memory + **PGlite** |
| 4 | Server RAG over admin docs | `ai.test.ts`: docs chunked, embedded, retrieved, source cited; guild scoping/removal; `/ai docs-add` command path | Deterministic embeddings; exact index |
| 5 | Ticket deflection | `ai.test.ts`: no match returns human hand-off with zero provider calls; match answers with source | Service; no live ticket |
| 6 | Mention-only chat + moderation explanations | `ai.test.ts` chat/feature refusal; `commands.test.ts` explain leaves case state `open`; event ignores bots/DMs/non-mentions by construction | Service + command; event typechecked only |
| 7 | Thread summaries | `modules/community/src/commands.test.ts` `/ticket summary` calls the AI port and labels the result advisory | Command recorder; no live thread |
| 8 | Disable/kill switch breaks no command | `commands.test.ts`: `/ai status` works with `enabled: false`; one root remains registered | Registry + command |
| 9 | Cap and budget records | migration 0005, `DrizzleAiStore`, `packages/db/src/ai.test.ts`: scoped docs and atomic monthly increments | PGlite, not a Postgres server |
| 10 | Economy balances derive from the append-only ledger | `modules/community/src/economy.test.ts`, `community.test.ts`: balance equals the sum; no balance column; daily/transfer/buy/gamble all read the sum | In-memory + **PGlite** |
| 11 | Every money movement is idempotent | `economy.test.ts`: a repeated request id inserts no second entry; daily uses the UTC day key; `/rank` passes `ctx.interaction.id` | In-memory + **PGlite** |
| 12 | Concurrent double spend is impossible | `economy.test.ts`: two concurrent 80-unit transfers against 100 leave 20; `packages/db/src/economy.test.ts` repeats the race on PGlite | In-memory + **PGlite**, not a Postgres server |
| 13 | Refusals are explicit and server-side | `economy.test.ts` + `commands.test.ts`: insufficient funds, self-pay, bot target, transfer/bet caps and daily cooldown | Service + command |
| 14 | Economy proof survives restart | `packages/db/src/economy.test.ts`: close/reopen PGlite, balance and ledger rows return; a duplicate key inserts once | PGlite |

P4 is green for the named buildable rows. The full matrix is still not fully
green: live gateway/provider behavior, live role grants, pgvector ANN at
1M×1536, goodbye messages, YouTube/Twitch-specific feeds and MEE6 import (P5)
remain open.

## P2 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | One case spine with atomic numbering | `packages/db/src/migrations/0003-case-counters.ts`, `case-store.ts`, `modules/moderation/src/cases.ts`; `CaseService` opens the case before an action | **PGlite**, not a Postgres server |
| 2 | Scripted raid contained | `modules/moderation/src/security.test.ts`: 10 joins + 5 invite posts + 1 webhook → 20 cases; 11 quarantine, 5 delete-message, 1 delete-webhook, 1 timeout | Policy engine + action recorder, not a live gateway |
| 3 | Every action has reason and appeal | The same test asserts every case has a reason and every notification has a `keystone:appeal:` button; `/mod` test asserts the custom id | Recorder, not a live Discord button |
| 4 | Dry-run is default and takes no punitive action | Default-settings test: zero action calls, every case `alerted`; `/mod` dry-run test: zero cases and zero action calls | Recorder |
| 5 | `/mod` guarded and case-first | `modules/moderation/src/mod.test.ts`: dispatch blocks without `ModerateMembers`; enforced ban creates case/reason before the action; missing reason throws | Dispatch + fake action port |
| 6 | Appeals and verification | `mod.test.ts`: target opens an appeal, event appended, other user rejected; `/verify` calls `unquarantine` | In-memory case store + recorder |
| 7 | Native AutoMod plan | `security.test.ts`: two prefixed rules, alert action, disabled by default | Pure plan; Discord sync adapter unrun |
| 8 | Records | this page, [[Roadmap]], [[ADR-0007-moderation-capability-port]], journal pass 05, `project.json` | Vault check |

## P1 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Data spine and port isolation | `packages/db/src/schema.ts`, `migrations/0001-init.ts` (PK on guild+module+key), `apps/bot/src/runtime.ts`; no module imports Drizzle | Schema and migration applied in PGlite; grep confirms no module/table import |
| 2 | Settings survive restart with JSON fidelity | `packages/db/src/settings.test.ts`: writes through `SettingsService`, closes, reopens the same data directory, `toEqual`/`toStrictEqual` on nested objects, arrays, null, numbers, Unicode and `"123"`; module isolation through two modules | **PGlite** (the Postgres engine as WASM), not a server |
| 3 | Atomic cooldowns and explicit fallback | `packages/cache/src/cooldowns.test.ts`: 50 concurrent `hit`s → exactly 1 allowed; TTL admits the next; fallback warns and is process-local | Atomic in-process stand-in for Redis, not a Redis server |
| 4 | Retry once, dead-letter at the limit, shared policy | `packages/queue/src/queue.test.ts`: attempts 2 / effects 1 on a transient failure; attempts 3 and receipt `failed` on a permanent one; duplicate delivery skipped; dispatch by job name; unknown job failed. `RetryPolicy` is one object used by `retryOptions` and the in-process driver | **In-process driver**; BullMQ's configuration is unit-tested, live BullMQ is not |
| 5 | One trace across command → DB → queue | `apps/bot/src/p1.test.ts`: one trace id across `command`, `db.settings.get`, `db.settings.set`, `queue.enqueue`, `job demo.job`, with parent ids checked; `createTelemetry()` returns a no-op with no exporter | In-memory span exporter, not a collector |
| 6 | `/setup` guarded and read-only | `modules/setup/src/setup.test.ts`: dispatch blocks without `ManageGuild`, runs with it, reports ready/missing/pending/disabled, and a repository spy proves zero writes | Fixtures and a fake health probe |
| 7 | Build, packaging and explicit migrate | `pnpm build` from a clean `dist`; artefacts exit 1 with their missing-prerequisite messages; a worker pointed at a closed Redis port exits 1 with a redacted URL **before** it logs ready; `compose.yaml` has a one-shot `migrate` service that bot/worker wait on | Node 24 locally; Docker image not built |
| 8 | Records | this page, [[Roadmap]], [[ADR-0006-ports-and-adapters]], journal pass 04, `project.json` | Vault check |

## Proven vs still needs a live service

| Claim | Proven here? | How to close |
| --- | --- | --- |
| Settings survive restart | Yes, on PGlite | Same test against a Postgres server |
| JSONB fidelity (null, arrays, numeric string) | Yes, on PGlite | Same |
| Cooldown single-winner | Yes, on an atomic stand-in | Run the 50-caller test against Redis |
| Job retries and dead-letters | Yes, on the in-process driver with shared policy | Run a failing job through `apps/worker` + Redis |
| Worker refuses an unreachable Redis | Yes, bundled worker against a closed port | Re-run with a live Redis; the same ping passes |
| Trace propagation | Yes, in-memory exporter | Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a collector |
| Scripted raid containment | Yes, policy engine + recorder | Replay in a staging guild |
| Case numbering/events | Yes, PGlite | Same against Postgres |
| Real ban/kick/timeout/purge/lock | No | Staging guild with the bot's permissions |
| Gateway joins/messages/audit events | No | Live guild with privileged intents |
| Native AutoMod sync | Plan tested, adapter not run | Enable sync in staging |
| XP/currency idempotency | Yes, in-memory + PGlite | Same against a Postgres server |
| Economy double-spend | Yes, in-memory queue + PGlite guild lock | Two bot shards against one Postgres server |
| Economy balance after restart | Yes, PGlite close/reopen | Same against a Postgres server |
| P3 ticket records/transcripts | Yes, port + PGlite | Live thread round-trip |
| P3 service events/buttons | Yes, recorder | Staging guild with intents |
| P3 Discord sends/threads/voice | No | Staging guild with permissions |
| AI provider request/cost | Yes, fake fetch | Real configured provider |
| AI hard cap and zero retention | Yes, service + PGlite | Same against Postgres |
| Exact server-doc retrieval | Yes, deterministic embeddings | Production embeddings + pgvector ANN |
| AI mention event / live sends | No | Staging guild with `MessageContent` |
| 1M×1536 pgvector p95/recall | No | Postgres+pgvector research benchmark |
| Container build | No | `docker compose up` on a machine with a daemon |
| Live gateway login | No | Set `DISCORD_TOKEN` and invite the bot |

No document claims a live-server or live-gateway run for a row marked "not
proven". The join-gate expiry job, temporary-ban/temp-role expiry, case export
and panic mode are named as open in the moderation status; they are not claimed
here.

## Next

P5 — dashboard and fleet: per-guild authorisation, importers, export/restore and
drift detection. Before launch, close the pgvector ANN gate and run the live
provider/Discord smoke in staging.
