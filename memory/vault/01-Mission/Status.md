# Project status

## Now

**P6 authorization foundation is in repo** (pass 17, 2026-11-01): Discord
OAuth2 code + PKCE, sealed state, opaque Postgres-backed sessions, BigInt
guild authorization with a bot-token membership check, a read-only HTML
dashboard and `/api/v1` reads. The browser never receives a Discord token. This
is the read-only first step from the roadmap's kill signal, not the full P6
exit demo: settings writes, fleet actions and scoped API tokens are still open.
See [[Dashboard]] and [[ADR-0016-dashboard-foundation]].

**P5 is complete in-repo** (pass 13, 2026-10-31): a versioned export bundle with
checksum and counts, transactional restore with post-import verification, a
24-hour rollback, deletion receipts, file level importers, transcript archives,
a read-only drift report and migration guides. P4.5 platform hardening and the
P4 AI/economy layers remain as shipped.

**Web verification (pass 17):** `pnpm web:start` booted in memory mode; real
HTTP requests returned `/healthz` `200`, `/` `200`, `/api/v1/nope` `404` and
`/login` `503`. A real local HTTP server with a fake OAuth port proved login,
logout/CSRF, cross-guild `403`s, escaped HTML and no token in the response. Live
Discord OAuth is not claimed.

**Live verification (pass 15, 2026-11-01):** AI Team#5758 logged into the test
guild and answered a qwen3:8b mention in `#ai-chat`. SaseQ's `discord-mcp` cannot
invoke slash commands, so a **dev-only `!` bridge** now feeds the real dispatch
pipeline in `DEV_GUILD_ID`: `!ping`, `!about`, `!ai status`, `!mod history` and
`!rank leaderboard` all returned live Discord messages/embeds. `!ticket stats`
exposed a real ordering bug (guild stats required a ticket first), now fixed and
tested. On ready the bot now clears application commands, re-registers the full
set, and fetches Discord's list to log missing/extra names. Slash interaction
handling from a human client is still unproven; obscured channels, live role
grants, live Postgres and a MEE6 pull remain unverified. The P6 auth foundation
now follows this work. The baseline, P4.5, P5 and P6 foundation are published at
https://github.com/RNGBubba/keystone-discord-bot under AGPL-3.0-or-later; the
public packaging pass also added the README and `AGENTS.md` read paths.

## Gate

```
pnpm check        exit 0 · typecheck 0 · 182 tests / 30 files · budget 10/100 · memory 1785/1785
pnpm build        exit 0 · bot, worker, web, migrate and portability artefacts
live              2026-11-01 · AI Team#5758 · 2 guilds · 10 commands · qwen3:8b reply in #ai-chat
live commands     2026-11-01 · !ping · !about · !ai status · !mod history · !rank leaderboard
live failure      !ticket stats → ManageGuild guard (MCP bot is not admin); branch fixed and unit-tested
public            2026-11-01 · https://github.com/RNGBubba/keystone-discord-bot · AGPL-3.0-or-later
```

A local `.env` exists in the working tree. Smoke commands pin
`DOTENV_CONFIG_PATH=.env.absent` so the result is deterministic and does not
read that file.

## P6 foundation acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | OAuth2 code + PKCE, sealed state and `iss` validation | `apps/web/src/web.test.ts`: missing state cookie, wrong issuer and wrong state all `400` before exchange | Real local HTTP + fake OAuth |
| 2 | Opaque server-side session, not a browser token | `packages/db/src/web-store.test.ts`: round trip and update; `web.test.ts`: raw session id is not a key | **PGlite** + in-memory store |
| 3 | Discord tokens never reach the browser | `web.test.ts`: HTML/JSON bodies do not contain the access or refresh token; sealed values only | Real HTTP response assertions |
| 4 | Per-guild authorization, two checks | `web.test.ts`: non-admin `403`, cross-guild id `403`, guild without the bot `403`; `access.ts` BigInt tests | Real HTTP + fake OAuth/bot membership |
| 5 | BigInt permission parsing | `web.test.ts`: bit 40 `MODERATE_MEMBERS` is not Manage Guild; invalid bitfield is false | Unit |
| 6 | One real read path through repository seams | `web.test.ts`: `/api/v1/guilds/:id/overview` and the HTML page show guild-scoped counts; `packages/db/src/web-store.test.ts` proves a second guild does not leak | Real HTTP + **PGlite** |
| 7 | CSRF and revocation | `web.test.ts`: logout without CSRF `403`; valid logout `302` then `/api/v1/me` `401` | Real local HTTP |
| 8 | No token or secret in a route | `web.test.ts`: `/healthz` has only ok/database/oauth; CSP and `no-store` asserted | Real HTTP |

This table proves the foundation, not the exit demo. Live OAuth, a live
Postgres-backed session and every P6 write surface remain open.

## P5 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | A versioned bundle is verifiable before a write | `packages/importer/src/importer.test.ts`: round trip, canonical key order, edited checksum, unsupported version, count mismatch | Pure functions |
| 2 | A 5,000-member guild exports, wipes and restores | `packages/db/src/portability.test.ts`: 5,002 levels, checksum equality after restore, `verified: true` | **PGlite**, not a Postgres server |
| 3 | A failed restore leaves the old guild intact | Same suite: duplicate case number forced inside the transaction; rejection; pre/post checksum equal | **PGlite** transaction |
| 4 | A 24-hour rollback restores the pre-import snapshot | Same suite: changed setting before import, rollback returns it, state `rolled-back` | **PGlite** |
| 5 | Deletion leaves a receipt without content | Same suite: counts, deleted guild id, content hash, backups removed, guild rows gone | **PGlite** |
| 6 | File importers are honest about source limits | `importer.test.ts`: MEE6 `players[]`, bad ids, duplicates, quoted CSV, level-derived XP, transcript HTML/JSON | Pure fixtures |
| 7 | Merge is narrow and named | `importer.test.ts`: settings upsert, keep-higher and add-on-top; service adds the limitation warning | Pure functions |
| 8 | Drift is report-only | `portability.test.ts`: missing channel, refused permission, missing AutoMod rule, `readOnly: true` | Snapshot + supplied live facts |
| 9 | Operators have a safe surface | `scripts/portability.ts`: dry-run, `--yes`, `0600` export, receipts; [[Portability-Runbook]] | CLI smoke (usage); live Postgres not run |
| 10 | The decision is recorded | [[ADR-0015-portability-bundles-and-receipts]], [[Portability]], [[Migration-Guides]] | Vault check |

## P4.5 acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Hidden channels are a typed outcome, not a crash | `apps/bot/src/channels.test.ts`: flag, `___hidden___`, null, 10003/50001/50013 and a generic error | Fixtures; live rollout not observed |
| 2 | Every bot fetch site uses the resolver | `pnpm audit:channels`: 9 call sites; no `.channels.cache` identity use | Static scan of `apps/bot/src` |
| 3 | Core works without privileged intents | `INTENT_PROFILE=minimal` returns only non-privileged intents; `pnpm audit:intents` prints the disabled features | Registry + manifest tests |
| 4 | `/setup` names disabled features | `modules/setup/src/setup.test.ts`: minimal profile shows `GuildMembers` consequence and the `INTENT_PROFILE=full` next step | Fake health probe, zero writes |
| 5 | Optional intent contract is validated | `packages/kernel/src/registry.test.ts`: required/optional split, fallback join, duplicate rejection | Registry |
| 6 | Memory cannot silently drift | `pnpm memory:check`: 113 features, 20 claims, 16 passes, 15 decisions, 4 generated pages, 286 wikilinks | Machine files + generated pages |
| 7 | The plan is recorded | [[ADR-0012-required-and-optional-intents]], [[ADR-0013-roadmap-v2-portability-first]], [[ADR-0014-memory-v2-machine-truth]] | Vault check |

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
| 6 | Mention-only chat + moderation explanations | `ai.test.ts` chat/feature refusal; `commands.test.ts` explain leaves case state `open`; event ignores bots/DMs/non-mentions by construction | Service + command; **live** mention reply via the dev guild seam |
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
| Gateway joins/messages/audit events | Messages yes; joins/audit no | Message event observed live; replay joins/audit in staging |
| Native AutoMod sync | Plan tested, adapter not run | Enable sync in staging |
| XP/currency idempotency | Yes, in-memory + PGlite | Same against a Postgres server |
| Economy double-spend | Yes, in-memory queue + PGlite guild lock | Two bot shards against one Postgres server |
| Economy balance after restart | Yes, PGlite close/reopen | Same against a Postgres server |
| P3 ticket records/transcripts | Yes, port + PGlite | Live thread round-trip |
| P3 service events/buttons | Yes, recorder | Staging guild with intents |
| P3 Discord sends/threads/voice | No | Staging guild with permissions |
| Channel obfuscation classification | Yes, fixtures | A staging guild after 2026-11-16 |
| Intent profile and `/setup` report | Yes, registry + fake health | A live login with the matching Portal intents |
| Export/restore/rollback/deletion | Yes, PGlite with 5,002 levels | Same against a Postgres server |
| MEE6 and generic file import | Yes, fixtures | A real MEE6 export and a real Postgres server |
| Transcript archive | Yes, HTML/JSON fixtures | A real Ticket Tool/ProBot file |
| Drift report | Yes, supplied live facts | A live guild via the P6 collector |
| CLI against a real database | No | `pnpm portability export` with compose Postgres |
| AI provider request/cost | Yes, fake fetch | Real configured provider |
| AI hard cap and zero retention | Yes, service + PGlite | Same against Postgres |
| Exact server-doc retrieval | Yes, deterministic embeddings | Production embeddings + pgvector ANN |
| AI mention event / live sends | Yes, Qwen3:8b reply in `#ai-chat` | Repeat with a human author; slash-command replies still unobserved |
| 1M×1536 pgvector p95/recall | No | Postgres+pgvector research benchmark |
| Container build | No | `docker compose up` on a machine with a daemon |
| Live gateway login | Yes, 2026-11-01 as AI Team#5758 | Repeat on the production shard after P10 |
| Slash-command execution | No | A human client, or a harness with interaction support |
| Dashboard HTTP surface | Yes, real process in memory mode | Re-run with Postgres and a real OAuth client |
| Dashboard login/session/CSRF/authz | Yes, real HTTP + fake OAuth | A live Discord OAuth round trip |
| Dashboard Postgres session | Yes, PGlite | A Postgres server |

No document claims a live-server or live-gateway run for a row marked "not
proven". The join-gate expiry job, temporary-ban/temp-role expiry, case export
and panic mode are named as open in the moderation status; they are not claimed
here.

## Next

P6 remains the active phase. The auth foundation is built; next are schema-driven
settings writes, the Next.js shell (or a decision to keep server-rendered HTML),
fleet actions/templates, token refresh and revocation, scoped API tokens,
per-token rate limits, `Idempotency-Key`, webhooks and OpenAPI. Before launch,
close the pgvector ANN gate and run the live provider/Discord/Postgres/OAuth
smoke in staging.
