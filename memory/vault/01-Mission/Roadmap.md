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

## Next

### P5 — Portability and migration

**Goal:** own the data-ownership wedge honestly.

- `packages/importer`: versioned export bundle, manifest/checksum, dry-run diff,
  merge modes, idempotent apply, 24-hour rollback, import and deletion receipts.
- Sources: MEE6 levels via the public leaderboard; generic JSON/CSV; Lurkr,
  Polaris, Arcane and XP Bot files; ProBot JSON and Ticket Tool HTML transcripts;
  our own bundle for full-fidelity restore.
- Drift detection: desired config vs live roles, channels, permissions and
  AutoMod; report only.
- Migration guides for Dyno, Carl-bot and Wick, which have no usable egress.

**Exit demo:** seed a 5,000-member guild, export, wipe, restore; config hash and
counts match. Import a MEE6-format fixture and a generic CSV; a failed import
rolls back; deletion produces a receipt.

**Kill signal:** if MEE6 import is blocked, drop the one-click claim and keep
file-based import plus guides. Never scrape.

### P6 — Dashboard, API and fleet

**Goal:** one dashboard with real per-guild authorization and an API at every tier.

- Next.js App Router, OAuth2 code + PKCE, `state` and `iss` validation, exact
  redirect URIs.
- Postgres sessions, encrypted Discord tokens server-side, rotation and revoke.
- `requireGuildAccess()` with BigInt permissions and a bot-token membership check;
  `owners[]` for instance-wide actions; CSP, CSRF, rate limits.
- Schema-driven settings forms from the module Zod schemas; fleet view; templates;
  audit log; import/export/drift; analytics aggregates.
- Public API v1: hashed scoped tokens, OpenAPI, `Idempotency-Key`, webhooks,
  per-token rate limits.

**Exit demo:** two guilds and two users; user A cannot read/write guild B through
the UI or API. Every setting is editable. A template applies with a preview. A
guild-scoped token cannot read another guild. A repeated POST returns the same
response.

**Kill signal:** if the authz matrix cannot pass, ship read-only fleet view first
and defer writes.

### P7 — Parity completion, UI and i18n

**Goal:** close the union the paid bots cover and make every panel fit the platform.

- `packages/ui`: Components V2 budgeter (40 components, ~4,000 text), primitives,
  defer-then-edit, modal Label/FileUpload/Radio/Checkbox.
- New domains: invites, forms/applications, events/RSVP, role persistence,
  modmail, auto-responders, analytics; plus goodbye messages, YouTube/Twitch/RSS
  feeds, temp ban/role expiry, join-gate expiry, panic mode and case export.
- `/config` and `/help` hubs; command-budget audit.
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
