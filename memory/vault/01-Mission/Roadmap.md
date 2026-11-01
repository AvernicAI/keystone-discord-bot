# Roadmap

> This is the phase index for the approved **Roadmap v2** ([[ADR-0013-roadmap-v2-portability-first]]).
> For the reasoning and the specialist team read [[Master-Plan]]; for the
> feature-level truth read the generated [[Feature-Status]].

Each phase ends with **a demo, a doc, a memory update and a written critique**.
A phase is not done because the code exists.

## Done

### P0 — Foundation

Kernel, module contract, reference module, memory system, strict TypeScript,
token-free tests, command-budget ledger. Exit: `pnpm check` green without a token;
the diagnostics module is the template.

### P1 — Substrate

Postgres data spine and ordered migrations, Drizzle settings repository, Redis
cooldowns with an explicit fallback, a BullMQ worker plus an in-process driver,
OpenTelemetry, `/setup`, a bundled production build and compose. Exit evidence is
in [[01-Mission/Status|project status]] and pass 04.

### P2 — Moderation and security

Cases and atomic case numbers, `/mod`, the invite/mention/duplicate scanner,
native AutoMod plan, evidence cards, review queue, appeals, anti-nuke, anti-raid,
quarantine, join gate, `/verify` and action logging. Dry-run is the default.

### P3 — Community

Leveling, economy ledger, reaction roles, welcome/delayed autorole, starboard,
thread tickets, giveaways, temp voice, content/sticky tools, feeds, seasons,
birthdays, suggestions, polls and stat channels. `/rank`, `/ticket` and `/tools`
are the only new roots.

### P4 — AI and economy hardening

Provider abstraction, hard per-guild dollar and request caps, server-doc RAG,
ticket deflection, mention-only chat, moderation explanations, summaries and
advisory classification. Balances are sums over `economy_ledger`; movements are
idempotent and double-spend-safe.

### P4.5 — Platform hardening (done 2026-10-31)

**Why first:** Discord's channel-obfuscation change lands **2026-11-16**, and the
June 2026 privileged-intent threshold is 10,000 users.

**Done:** `resolveChannel()` and all nine fetch sites migrated; the
`CHANNEL_OBFUSCATED` fixture; required vs optional intents; `INTENT_PROFILE`;
`/setup` capability report; `audit:channels` and `audit:intents`; baseline commit;
six research pages; memory v2 and generated status pages.

**Exit evidence:** 1,616 memory checks; 26 focused tests at the hotfix point;
`pnpm check` green at close. Live obfuscated channels and a live gateway login
remain unproven here.

### P5 — Portability and migration (done 2026-10-31)

**Goal:** own the data-ownership wedge honestly.

**Done:**

- `packages/importer`: versioned `keystone.export` v1 bundle, canonical SHA-256
  checksum and counts; dry-run diff; transactional full restore; narrow settings
  + levels merge; 24-hour rollback; import and deletion receipts.
- Sources: saved MEE6 leaderboard JSON; generic JSON/CSV; Lurkr, Polaris, Arcane
  and XP Bot files; ProBot JSON and Ticket Tool HTML transcript archives; our own
  bundle for full-fidelity restore. No scraping and no vendor credentials.
- `packages/db` portability store (PGlite-tested), `pnpm portability` CLI and
  migration guides for Dyno, Carl-bot and Wick.
- Drift report over settings ids vs supplied live facts; report only.

**Exit evidence:** `packages/db/src/portability.test.ts` proves a 5,000-row
round trip, checksum equality, a failed restore that leaves the guild intact, a
24-hour rollback, deletion receipt and drift. `packages/importer/src/importer.test.ts`
covers tampering, versions, MEE6, CSV, transcripts and merge modes.

**Live Discord runs:** pass 14 (2026-11-01) logged in as AI Team#5758,
registered 10 commands, and got qwen3:8b replies in `#ai-chat`. Pass 15 added a
dev-only `!` bridge because SaseQ's MCP cannot invoke slash commands; `!ping`,
`!about`, `!ai status`, `!mod history` and `!rank leaderboard` then ran through
the real registry, guards and reply adapter. The ready path fetches the global
command set and only clears and re-registers when the names drift; otherwise it
logs that the set is current. `pnpm commands:resync` is the explicit cycle. The
slash `InteractionCreate` path still needs a human client.

**Public release (pass 16):** the repo is public at
https://github.com/RNGBubba/keystone-discord-bot under AGPL-3.0-or-later. The
README covers setup, commands, features, agent onboarding and the Obsidian vault;
`AGENTS.md` is the short read order for contributors and agents.

**Honest limits:** MEE6 live fetch is not wired (file only); drift's live facts
come from a JSON file until P6; messages and attachments cannot be exported;
merge does not combine history. No live Postgres, slash-command run or human
mention was performed.

## Next

### P6 — Dashboard, API and fleet

**Goal:** one dashboard with real per-guild authorization and an API at every tier.

**Foundation shipped (passes 17–18, 2026-11-01):** see
[[ADR-0016-dashboard-foundation]] and [[Dashboard]]. The first slice is a
framework-free Node HTTP service so the authorization matrix could be proven
before a UI framework was added; settings writes followed through the same gate.

- [x] OAuth2 code + PKCE, sealed `state`, `iss` and exact redirect validation.
- [x] Opaque Postgres-backed sessions; the Discord access token sealed
  server-side and never sent to the browser. No refresh token is stored until
  refresh/rotation exists.
- [x] `GuildAccessService` with BigInt permissions and a bot-token membership
  check; CSP, CSRF and `no-store` on authenticated responses.
- [x] Read-only dashboard and `/api/v1` reads through the kernel
  `SettingsService` + `DashboardStore` seams.
- [x] Schema-validated module settings writes from the dashboard and API,
  through `SettingsService`, with CSRF and no mutation on invalid input.
- [ ] Next.js shell (or keep server-rendered HTML) and schema-driven field
  widgets; the current editor is a validated JSON textarea.
- [ ] Fleet view and templates with an explicit preview; audit log;
  import/export/drift surfaces; analytics aggregates.
- [ ] Session refresh/rotation and Discord token revocation on logout; per-route
  rate limits; `owners[]` for instance-wide actions.
- [ ] Public API v1: hashed scoped tokens, OpenAPI, `Idempotency-Key`, webhooks,
  per-token rate limits.

**Exit demo:** two guilds and two users; user A cannot read/write guild B through
the UI or API. Every setting is editable. A template applies with a preview. A
guild-scoped token cannot read another guild. A repeated POST returns the same
response.

**Kill signal:** if the authz matrix cannot pass, ship read-only fleet view first
and defer writes.

### P7 — Parity completion, UI and i18n

**Goal:** close the union the paid bots cover and make every panel fit the platform.

**Shipped slices:** invite tracking as `modules/invites` (pass 19) — cached-counter
attribution serialized per guild, durable `invite_joins`,
`/invites leaderboard | stats | who`, and advisory account-age / no-avatar
flags. Live: the command was registered and the `!invites` bridge ran in
`#ai-chat`; a live member join remains unperformed. The link / phishing filter shipped in
pass 23 — a local host blocklist plus punycode detection in `alert` or `delete`
mode, `/mod links` as its review queue, and a live MCP proof of three findings
and one review in `#ai-chat`. The profanity/zalgo filter shipped in pass 24 — an
operator-owned word list matched on Unicode word edges, a configurable
combining-mark threshold, `/mod filters` as the combined review queue, and a
live safe-seed proof of both finding types. The link delete branch was also
proven live once with a temporary `dryRun: false` seed, and pass 25 repeated the
delete proof for profanity. The auto-responder shipped in pass 25 — exact,
contains and regex triggers stored as guild records, one reply per message and a
per-trigger cooldown — and was proven live through the real gateway, including
cooldown suppression and release. Pass 26 made the command tree real: every
existing hub now registers Discord subcommands, `/help` is generated from the
registry, and boot sync plus `commands:doctor` compare the full option shape.
Pass 27 added a synthetic slash harness that crosses the real adapter and
dispatch for a nested `/mod ban`; it is not a gateway interaction, so a human
slash check remains open. Pass 28 added audit logging as the seventh module:
`/logging setup | channel | events | status | retention | export | disable`,
five event kinds, an append-only `logging_events` ledger, per-event toggles and
retention pruning. Message edit/delete and moderation cases were proven live in
the operator channel; member join/leave are adapter-tested only. The ledger is
now **13 roots / 84 subcommands / 97 actions**. The rest of this phase is open.

- `packages/ui`: Components V2 budgeter (40 components, ~4,000 text), primitives,
  defer-then-edit, modal Label/FileUpload/Radio/Checkbox.
- New domains: forms/applications, events/RSVP, role persistence, modmail,
  analytics; plus goodbye messages, YouTube/Twitch/RSS feeds, temp ban/role
  expiry, join-gate expiry, panic mode and case export. Invites, the link,
  profanity and zalgo filters, and auto-responders are done (above).
- `/config` hub; `/help` shipped in pass 26; command-budget audit remains a gate.
- Split `modules/community` into domain folders, then extract a module only if the
  "add a feature in an afternoon" test still fails.
- `packages/i18n`: typed keys, per-guild locale, command localizations; no machine
  translation.
- AI invisible features: automod triage, semantic search, summaries; pgvector
  ANN benchmark remains a gate.

**Exit demo:** every panel passes the budgeter; every parity row has a command
path and a test; a guild switches locale; expiry jobs release temp actions; search
returns a cited case/ticket/doc; no prompt or completion is stored.

**Kill signal:** if the module split churns, stop at subfolders; if pgvector misses
its gate, keep the exact index and mark the ANN row open.

### P8 — Music and activities

**Goal:** complete the union without legal risk.

- Lavalink v4 through a thin adapter; BYO node; queue and controls; DJ role;
  disabled by default; no bundled streamer.
- Activity spike behind a flag; verify Portal eligibility; drop if ineligible.

**Exit demo:** an operator enables their own Lavalink and the controls work; the
repo contains no streamer; the Activity go/no-go is written down.

### P9 — Open-source launch

**Goal:** v1.0 a stranger can run and learn from.

- Licence finalised (AGPL-3.0 recommended), DCO, no CLA.
- Astro Starlight docs generated from the vault; link checker; tested snippets.
- Curriculum 14 lessons; module generator; `pnpm lesson:verify`.
- Root CONTRIBUTING/GOVERNANCE/SECURITY/CODE_OF_CONDUCT; issue/PR templates;
  release workflow; changelog; Docker images.
- One-command self-host; status page, privacy policy, ToS; App Directory/top.gg
  listing assets; staging-guild E2E.

**Exit demo:** clean VM, one command, bot online, dashboard up, `/setup` green; a
stranger completes "build a module" in an afternoon; docs build zero warnings.

### P10 — Hardening and scale

**Goal:** survive 2,500+ guilds and platform changes.

- Sharding, `shard` param on `/users/@me/guilds`, per-shard metrics.
- Load tests, SLOs, alerts, incident drills, cost per 1,000 guilds.
- Annual intent review; channel-obfuscation regression; discord.js v15 migration.
- Backup/restore and deletion drills; dependency policy.
- Post-v1.0: captcha provider, Google Calendar sync, advanced analytics, mobile app.

**Exit demo:** load test at target p95; v15 migration is one PR; incident drill
inside 30 minutes.

## Phase migration map

| Old label | New label | Change |
| --- | --- | --- |
| P5 Dashboard & fleet | **P6** | Portability moved ahead; API added |
| P6 Music | **P8** | After parity/UI |
| P7 Launch | **P9** | Adds docs site, staging E2E, listings |
| P8 Hardening | **P10** | Same spirit |
| — | **P4.5** | New platform hotfix |
| — | **P5** | New portability wedge |
| — | **P7** | New parity completion, UI and i18n |

## Sequencing rule

P4.5 protects the platform deadline. P5 creates the data model the dashboard
needs. P6 exposes which settings have no UI and which modules are hard to teach.
P7 closes the union and the UI budgets. P8 is optional and must not block launch.
P9 launches only after a verified demo. P10 hardens with real traffic.
