# Project status

## Now

**P7 invite tracking is in repo** (pass 19; cold-cache fix in pass 20;
gateway boundary in pass 21, 2026-11-01): the sixth module adds `/invites leaderboard | stats | who`,
durable `invite_joins` attribution with a unique
`(guild, user, joined_at)` key, SQL join/leave/retention totals, and advisory
account-age / no-avatar flags that never punish. A cold cache now records no
inviter and seeds the cache instead of diffing historical totals; the adapter
regression test covers that path. The bot receives `GuildInvites` and requests
`GuildMembers` optionally; a live join could not be performed because no second
Discord account was available. The gateway half is split: `invite-tracker.ts`
owns the cache and per-guild queue, and `invite-events.ts` only translates
discord.js events. MEE6's invite tracker is partly premium-gated (its wiki says
parts or the entirety may require Premium); neither Dyno nor Carl-bot documents
it. Distinguish this from P6, which remains open below.

**P7 content filters are in repo** (link pass 23; profanity/zalgo pass 24,
2026-11-01): the security engine checks a local host blocklist and punycode
labels, and matches an operator-owned word list on Unicode word edges plus a
configurable combining-mark threshold. Both support `alert` or `delete`;
`/mod links` and `/mod filters` list the findings, and `/mod review case=N`
closes one. There is no new command root. Live: marked MCP messages in
`#ai-chat` created link cases #1–#3 (subdomain, apex, punycode); `!mod review`
marked one reviewed; `example.com` created no case. With a temporary
`dryRun: false` / `delete` seed the blocked message returned
`10008: Unknown Message` while its case survived. The safe seed then produced a
profanity case for `pineapple` and a zalgo case for a 16-mark string; `!mod
filters` listed all three and `!mod review` closed the profanity case. A
`keystone-test:` marker is accepted from a bot author only in `DEV_GUILD_ID` and
stripped before the engine sees it; production has no marker path. See
[[04-Modules/moderation/Spec|Moderation spec]] and
[[04-Modules/moderation/Status|Moderation status]].

**P7 auto-responder is in repo** (pass 25, 2026-11-01): the community module
owns exact, contains and regex triggers in the existing
`community_records` seam. One trigger replies per message (exact beats
contains, contains beats regex), every trigger has its own cooldown, and
`/tools responder | responders | responder-remove` is the admin surface under
the existing `/tools` root. Live: the seeded `hello keystone` trigger replied to
a marked MCP message; a second identical message inside the 60-second cooldown
got no reply; a third after the window replied again. See
[[04-Modules/community/Spec|Community spec]] and
[[04-Modules/community/Status|Community status]].

**P7 command tree is in repo** (pass 26, 2026-11-01): the kernel now models
real Discord subcommands and subcommand groups. Every existing hub exposes its
working actions as subcommands — `/mod` 14, `/rank` 12, `/ticket` 8, `/tools` 24,
`/ai` 11 and `/invites` 3 — for **12 roots · 77 subcommands · 89 actions**. The
new `/help` root (`browse`, `commands`, `search`, `privacy`, `changelog`) reads
the live registry, so its catalog cannot drift. `pnpm commands:catalog` generates
`memory/machine/commands.json` and [[Command-Catalog]], and
`pnpm commands:doctor` prints the live registration shape without writing. Two
defects found during proof are fixed: the structural adapter now flattens nested
subcommand options, and boot sync compares the whole option tree instead of names
alone. Live: `pnpm commands:doctor` reported 12 roots / 77 subcommands with no
drift; the `!` bridge returned `!help commands`, `!help browse`, `!help search
query=ban`, `!mod history` and `!ai status` through the real gateway. See
[[03-Architecture/Command-Budget|Command budget]] and
[[03-Architecture/ADR/ADR-0003-command-budget]].

**P6 authorization and settings-write foundation is in repo** (passes 17–18;
server boundaries in pass 22, 2026-11-01): Discord OAuth2 code + PKCE, sealed
state, opaque Postgres-backed sessions, BigInt guild authorization with a
bot-token membership check, a server-rendered dashboard, `/api/v1` reads and
schema-validated module settings writes from both the HTML form and
`PATCH /api/v1`. The web process is split into an ordered route table, per-area
handlers, one request context, shared render/HTTP modules and one settings-write
CSRF gate. The browser never receives a Discord token; the session stores one
sealed access token and no refresh token.
This is the read-only auth step plus a narrow write path, not the
full P6 exit demo: field widgets, fleet actions and scoped API tokens are still
open. See [[Dashboard]] and [[ADR-0016-dashboard-foundation]].

**P5 is complete in-repo** (pass 13, 2026-10-31): a versioned export bundle with
checksum and counts, transactional restore with post-import verification, a
24-hour rollback, deletion receipts, file level importers, transcript archives,
a read-only drift report and migration guides. P4.5 platform hardening and the
P4 AI/economy layers remain as shipped.

**Web verification (passes 17–18):** `pnpm web:start` booted in memory mode;
real HTTP requests returned `/healthz` `200`, `/` `200`, `/api/v1/nope` `404` and
`/login` `503`. A real local HTTP server with a fake OAuth port proved login,
logout/CSRF, cross-guild `403`s, escaped HTML and no token in the response. The
same harness proved a `PATCH` and the HTML form persist real module settings via
`SettingsService`, invalid values are rejected without mutation, and a missing
CSRF token or unauthorized guild is refused. Live Discord OAuth is not claimed.

**Live verification (pass 15, 2026-11-01):** AI Team#5758 logged into the test
guild and answered a qwen3:8b mention in `#ai-chat`. SaseQ's `discord-mcp` cannot
invoke slash commands, so a **dev-only `!` bridge** now feeds the real dispatch
pipeline in `DEV_GUILD_ID`: `!ping`, `!about`, `!ai status`, `!mod history` and
`!rank leaderboard` all returned live Discord messages/embeds. Pass 19 added
`!invites leaderboard` and `!invites who`. Pass 26 re-registered **12 roots /
77 subcommands** and added `!help commands`, `!help browse`, `!help search
query=ban`, `!mod history` and `!ai status` to the live list; Discord's fetched
shape matched the registry with no missing, extra or changed roots. Pass 23
added `!mod links` and a live link-filter proof: three marked MCP messages
produced a blocklisted
subdomain case, an apex case and a punycode case; `!mod review case=2` marked one
reviewed, and an ordinary `example.com` link produced no case. Pass 24 added
`!mod filters` and profanity/zalgo, and closed the pending delete-mode gap: a
temporary `dryRun: false` / `links: "delete"` seed made the blocked message
return `10008: Unknown Message` while its case remained. The safe seed then
produced a profanity case for `pineapple` and a zalgo case for a 16-mark string,
listed by `!mod filters`; an ordinary sentence produced no case. Pass 25 then
repeated the delete proof for profanity: a temporary `dryRun: false` /
`profanity: "delete"` seed removed the `pineapple` message while case #1 stayed
open in `!mod filters`; the safe seed is committed. Pass 25 also added the
auto-responder: a marked MCP message matched the seeded `hello keystone` trigger
and got `Hi from Keystone's auto-responder.`, a second identical message inside
the 60-second cooldown got no reply, and a third after the window replied again.
`!ticket stats`
exposed a real ordering bug (guild stats required a ticket first), now fixed and
tested. On ready the bot fetches Discord's command set and only clears and
re-registers when the **name or option tree** drifts; otherwise it logs that the
set is current. `pnpm commands:doctor` is the read-only shape check and
`pnpm commands:resync` is the explicit clear → register → verify cycle. Slash
interaction handling from a human client is still unproven; obscured channels,
live role grants, live Postgres and a MEE6 pull remain unverified. The P6 auth
foundation is documented above. The baseline, P4.5, P5 and P6 foundation are
published at
https://github.com/RNGBubba/keystone-discord-bot under AGPL-3.0-or-later; the
public packaging pass also added the README and `AGENTS.md` read paths.

## Gate

```
pnpm check        exit 0 · typecheck 0 · 253 tests / 40 files · budget 12/100 roots (77 subcommands) · memory 1986/1986
pnpm build        exit 0 · bot, worker, web, migrate and portability artefacts
live              2026-11-01 · AI Team#5758 · 2 guilds · 12 roots / 77 subcommands · qwen3:8b reply in #ai-chat
live commands     2026-11-01 · !ping · !about · !help commands · !help browse · !help search query=ban · !ai status · !mod history · !mod links · !mod filters · !rank leaderboard · !invites leaderboard · !invites who
live content filters 2026-11-01 · link delete returned 10008 Unknown Message; profanity delete removed the pineapple message and kept its case; safe seed produced link/profanity/zalgo cases; one reviewed; example.com not flagged
live auto-responder 2026-11-01 · hello keystone replied, 60s cooldown suppressed the next reply, then released
live failure      !ticket stats → ManageGuild guard (MCP bot is not admin); branch fixed and unit-tested
public            2026-11-01 · https://github.com/RNGBubba/keystone-discord-bot · AGPL-3.0-or-later
```

A local `.env` exists in the working tree. Smoke commands pin
`DOTENV_CONFIG_PATH=.env.absent` so the result is deterministic and does not
read that file.

## P7 invite acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Attribution is a deterministic diff, not a guess | `invites.test.ts`: increment, new code, unchanged, missing inviter, code tie-break; `invite-events.test.ts`: a cold cache records no inviter | Pure functions + adapter |
| 2 | A repeated gateway delivery cannot double-count | `invites.test.ts` and `invite-store.test.ts`: second identical join returns false; the unique key is `(guild, user, joined_at)` | In-memory + **PGlite** |
| 3 | Concurrent joins are serialized per guild | `apps/bot/src/invite-tracker.ts`: one promise chain per guild, no queue shared across guilds; `invite-tracker.test.ts` holds the first fetch open and proves the second join waits | Tracker with a gated fetch; not a live gateway race |
| 4 | Joins, leaves and retention are computed in SQL | `invite-store.test.ts`: two joins and one leave produce `{joins: 2, leaves: 1, retained: 1}` | **PGlite** |
| 5 | Flags are advisory | `invites.test.ts`: one log embed, footer "Advisory only"; the port has no ban/kick/timeout method | In-memory + recorder |
| 6 | Settings are the module's own schema | `inviteSettingsSchema`; the dashboard uses the same catalog, no web-only schema | Shared catalog |
| 7 | The command fits the budget and declares its intents | `commands.test.ts`: one root, budget 1, `GuildInvites` required, `GuildMembers` fallback named by `/setup` | Registry |
| 8 | The real surface runs | Live 2026-11-01: 12 roots / 77 subcommands registered including `invites`; `!invites leaderboard` and `!invites who` dispatched and replied in `#ai-chat` | Live gateway |
| 9 | A live member join was **not** performed | `Status.md` limitation; no second account was available | Not claimed |

## P7 auto-responder acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | Exact, contains and regex triggers are distinct | `modules/community/src/responder.test.ts`: exact does not fire on a longer sentence; contains and regex do | In-memory service |
| 2 | One reply per message, with deterministic precedence | Same suite: exact beats contains regardless of save order; one send | In-memory service |
| 3 | A trigger cooldown suppresses and then releases | Same suite moves the clock; live 2026-11-01: second message inside 60s got no reply, third after the window replied | Service + **live gateway** |
| 4 | Configuration is admin-only and input is validated | `modules/community/src/commands.test.ts`: `ManageGuild` guard, enable/list/remove, duplicate and invalid regex rejected | Command + service |
| 5 | Records are guild-scoped and survive a restart | `packages/db/src/community.test.ts`: one record after close/reopen, zero in another guild | **PGlite** |
| 6 | The dev marker cannot widen production | `apps/bot/src/community-events.test.ts`: bot message without marker and marker in another guild do nothing; fixture message never awards XP | Adapter test |
| 7 | The feature costs no new root | `/tools` subcommands `responder`, `responders`, `responder-remove`; budget remains 12 roots / 77 subcommands | Static registry |
| 8 | The real surface runs | Live 2026-11-01: marked MCP message `hello keystone` produced `Hi from Keystone's auto-responder.` | **Live gateway** |

## P7 content-filter acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | A blocklisted host and its subdomains alert or delete | `security.test.ts`: `login.phish.test` matches `phish.test`; live #1 and #2 | Pure engine + **live gateway** |
| 2 | Punycode is suspicious without a list | `security.test.ts`: `xn--pple-43d.test`; live #3 | Pure engine + **live gateway** |
| 3 | An ordinary link is not flagged | `security.test.ts`: `example.com` returns no finding; live `!mod links` stayed at #3 | Pure engine + **live gateway** |
| 4 | A finding is reviewable through the existing case queue | `mod.test.ts`: `/mod links` reads an `automod.link` case; live `!mod review case=2` changed #2 to `reviewed` | Command + **live gateway** |
| 5 | Bot authors stay ignored outside the dev marker | `moderation-events.test.ts`: no marker → ignored; marker in another guild → ignored; marker stripped in `DEV_GUILD_ID` | Adapter test; production passes no option |
| 6 | Evidence is the host and match, not the message | `security.test.ts` asserts `{ host, match }`; the case stores no content | Unit |
| 7 | The feature costs no new root | `/mod links` and `/mod filters` are existing `/mod` subcommands; `pnpm budget` remains 12 roots / 77 subcommands | Static registry |
| 8 | A live `delete`-mode deletion | Temporary `dryRun: false` seed; blocked message ID returned `10008: Unknown Message`; case #1 stayed open | **Live gateway + Discord API** |
| 9 | A configured word is caught on word edges | `security.test.ts`: `ass` not `class`; phrase whitespace; live `pineapple` case #2 | Pure engine + **live gateway** |
| 10 | Excessive combining marks are caught at the threshold | `security.test.ts`: threshold hit and below-threshold; live 16-mark case #3 | Pure engine + **live gateway** |
| 11 | Both filter findings are reviewable through one queue | `mod.test.ts`: `/mod filters` lists profanity and zalgo; live `!mod review case=2` changed the profanity case to `reviewed` | Command + **live gateway** |

## P6 foundation acceptance evidence

| # | Criterion | Where it is asserted | Proven against |
| --- | --- | --- | --- |
| 1 | OAuth2 code + PKCE, sealed state and `iss` validation | `apps/web/src/web.test.ts`: missing state cookie, wrong issuer and wrong state all `400` before exchange | Real local HTTP + fake OAuth |
| 2 | Opaque server-side session, not a browser token | `packages/db/src/web-store.test.ts`: round trip; `web.test.ts`: raw session id is not a key | **PGlite** + in-memory store |
| 3 | No Discord credential reaches the browser | `web.test.ts`: HTML/JSON bodies do not contain the access token; the session stores only a sealed access token, with no refresh token | Real HTTP response assertions |
| 4 | Per-guild authorization, two checks | `web.test.ts`: non-admin `403`, cross-guild id `403`, guild without the bot `403`; `access.ts` BigInt tests | Real HTTP + fake OAuth/bot membership |
| 5 | BigInt permission parsing | `web.test.ts`: bit 40 `MODERATE_MEMBERS` is not Manage Guild; invalid bitfield is false | Unit |
| 6 | One real read path through repository seams | `web.test.ts`: `/api/v1/guilds/:id/overview` and the HTML page show guild-scoped counts; `packages/db/src/web-store.test.ts` proves a second guild does not leak | Real HTTP + **PGlite** |
| 7 | CSRF and revocation | `web.test.ts`: logout without CSRF `403`; valid logout `302` then `/api/v1/me` `401` | Real local HTTP |
| 8 | No token or secret in a route | `web.test.ts`: `/healthz` has only ok/database/oauth; CSP and `no-store` asserted | Real HTTP |
| 9 | A write is schema-validated by the bot's own contract | `web.test.ts`: `PATCH` and the form update AI settings through `SettingsService`; `monthlyBudgetUsd: 5000` is `400` and leaves the stored value unchanged | Real HTTP + in-memory repository |
| 10 | Every write is CSRF-protected | `web.test.ts`: missing header/form token is `403`; a valid token writes | Real HTTP |
| 11 | A write is guild-scoped and two-checked | `web.test.ts`: cross-guild, non-admin and bot-absent writes are `403`; no session is `401` | Real HTTP + fake OAuth |

This table proves the foundation and the narrow write path, not the exit demo.
Live OAuth, a live Postgres-backed session, field widgets, fleet actions and
scoped API tokens remain open.

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
| 6 | Memory cannot silently drift | `pnpm memory:check`: 115 features, 20 claims, 25 passes, 17 decisions, 4 generated pages, 347 wikilinks | Machine files + generated pages |
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
| Link / phishing filter | Yes: live alert + review, and live delete (`10008: Unknown Message`) | Re-run on staging with a human author |
| Profanity / zalgo filter | Yes: live alert cases + `/mod filters` + review, and live profanity delete (message gone, case #1 open) | Repeat zalgo delete with a disposable fixture on staging |
| Auto-responder | Yes: live trigger, cooldown suppression and release through the real gateway | Repeat with a human author and a re-opened process |
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
| Dashboard settings writes | Yes, real HTTP + in-memory repository | A Postgres server and a browser form run |
| Dashboard Postgres session | Yes, PGlite | A Postgres server |

No document claims a live-server or live-gateway run for a row marked "not
proven". The join-gate expiry job, temporary-ban/temp-role expiry, case export
and panic mode are named as open in the moderation status; they are not claimed
here.

## Next

P7 parity work continues alongside the P6 exit items. Auto-responders and the
content filters are done; the next open rows are forms/events, analytics,
modmail, expiry jobs, case export and panic mode. `automod.false-positive-report`
is still the smallest useful moderation follow-up. P6 remains the active phase
for the dashboard. The auth gate and settings writes are built;
next are schema-driven field widgets, the Next.js shell (or a decision to keep
server-rendered HTML), fleet actions/templates, token refresh and revocation,
scoped API tokens, per-token rate limits, `Idempotency-Key`, webhooks and
OpenAPI. Before launch, close the pgvector ANN gate and run the live
provider/Discord/Postgres/OAuth smoke in staging.
