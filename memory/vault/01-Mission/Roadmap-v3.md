# Roadmap v3 — Own the record

> **Status: proposed, 2026-11-03.** This is a plan, not machine truth. It does not
> change `project.json`, `passes.json` or `features.json`. [[Roadmap]] remains the
> active phase index until this page is accepted. The audit behind it is
> [[Memory-Audit-2026-11-03]].
>
> **Thesis:** every competitor is converging on the same feature list and the
> same AI demo. The durable difference is not the list. It is whether a server can
> **own its own record**, **prove what the bot did**, **leave without losing
> anything**, and **run the whole thing for free**. That is the moat Keystone can
> actually defend.

---

## 0. Executive summary

### 0.1 Where Keystone is

**Pass 65 snapshot.** Keystone is no longer a prototype. It has:

- **12 modules** registered: diagnostics, setup, moderation, community, AI,
  invites, logging, analytics, music, forms, events and modmail.
- **20 global roots**, **141 subcommands**, **161 actions** and **4 context menus**
  in the live registry.
- **134 parity rows**: 114 shipped in repo, 10 open, 6 planned and 4 explicit
  non-goals. **48 rows** carry a live-verification flag, but only 23 of those have
  a named `liveEvidence` check; the audit treats that as a vocabulary problem.
- At pass 65 the suite was **644 tests in 94 files**, all token-free; the gate
  passed without a Discord token, a database or the network.
- **28 live probe checks** on Postgres, Redis, the queue, the web process and the
  signed component router.
- A real portability wedge: checksummed export, dry-run import, rollback,
  deletion receipts, drift, and an in-Discord `/export` surface.
- A real operations wedge: OAuth/PKCE sessions, per-guild BigInt authorization,
  schema-generated settings, audited writes, scoped API tokens, signed webhooks,
  `Idempotency-Key` replay and an OpenAPI document.
- A real trust wedge: dry-run automod, evidence cards, appeals that survive a
  review, quarantine, a review queue, AI caps and zero retention.

That is a strong foundation. It is not yet the best bot in the category.

### 0.2 What the market looks like in late 2026

Three things are true at once:

1. **The generalists are broad but shallow.** MEE6 owns onboarding and leveling,
   Dyno owns moderation breadth, Carl-bot owns reaction roles, ProBot owns welcome
   images and invites, Ticket Tool owns tickets. None of them covers the union
   without a paywall, and none of them lets a server take its record and leave.
2. **Specialists still win on depth.** Jockie owns music, Statbot owns analytics,
   Wick and Security Bot own security, Apollo and Sesh own events, MonitoRSS and
   Streamcord own feeds, GiveawayBot owns giveaways, ModMail owns the DM inbox.
   A server still runs four to six bots because each specialist is genuinely
   better at its one job.
3. **The 2026 AI-native wave is competing on setup and support, not on trust.**
   PeakBot sells an "AI Server Builder", YourBot sells ten services plus a plugin
   marketplace and an AI plugin builder, Helper.gg sells a web panel with AI
   replies, and Wallu/Relayn/Atis/Quickchat sell knowledge-base deflection. Most
   of those claims are vendor marketing, not verified benchmarks. The strategic
   point is real: buyers now expect AI to shorten setup and answer the first
   support question.

The category does not need another feature-count leader. It needs a bot that is
**complete enough to replace the stack, trustworthy enough to survive a review,
and portable enough that choosing it is not a trap.**

### 0.3 The five tests (unchanged, and now the prioritisation rule)

A feature earns its place only if it passes all five:

1. **Removes a bot.** Which of MEE6, Dyno, Carl-bot, ProBot, Ticket Tool, Wick,
   Statbot, Jockie, Apollo/Sesh, MonitoRSS/Streamcord or ModMail does this let an
   admin uninstall?
2. **Works on the free tier.** If it only makes sense as an upsell, redesign it.
3. **Is reversible.** Can an admin undo it, export it and see why it happened?
4. **Fits the budget.** Global roots, Components V2 slots, intents, request
   budget, payload characters.
5. **Can be taught.** Spec, test, status page and an exercise, or it is not done.

### 0.4 The ten moats

The plan is organised around ten defensible differences, not a feature list:

| # | Moat | What it means | Current state |
| --- | --- | --- | --- |
| M1 | **One record** | One member timeline joining cases, tickets, invites, levels, economy, forms, events, modmail, logs and AI labels | Partial: stores exist, timeline view does not |
| M2 | **Exit guarantee** | Full export, import from every major bot, rollback, receipts, drift, structure snapshot | Strong for data; structure backup and NDJSON are open |
| M3 | **Explainable, reversible moderation** | Evidence, dry-run, appeal, review, false-positive feedback, undo | Strong; undo and false-positive loop are open |
| M4 | **Free forever** | Every shipped feature free; hosted convenience only; no re-gating | Strong by policy; needs public proof |
| M5 | **Ops-grade API** | REST, OpenAPI, SDK, webhooks, idempotency, scoped tokens, audit at every tier | Strong foundation; SDK and docs are open |
| M6 | **AI with receipts** | Local-first, cited, capped, zero-retention, human approval, eval | Strong policy; RAG ANN, KB UX and eval harness are open |
| M7 | **Data lifecycle** | Retention table, deletion receipts, privacy dashboard, minimal content | Strong exports; retention UI and lifecycle dashboard are open |
| M8 | **Zero-to-value** | `/setup doctor`, import wizard, templates, AI config planner with preview, ten-minute activation | Partial: `/setup` hub exists, wizard and planner do not |
| M9 | **Reliability and scale** | Sharding, queue, idempotency, SLOs, status page, load tests, backups | Foundation exists; sharding, SLOs and load tests are open |
| M10 | **Teachability** | Docs site, twenty lessons, module generator, contributor ladder, i18n | Strong memory and fourteen lessons; docs site, generator and wider i18n are open |

### 0.5 The next twelve months

| Phase | Weeks | Goal | Exit demo |
| --- | --- | --- | --- |
| **P7.5 Truth and live closure** | 2 | Make the memory and live proof match the code; finish the P7 tail | A human slash run, OAuth round trip, role persistence, case export, event buttons and a form modal all work; the gate is green on Windows and Linux |
| **P8 Support and community depth** | 4 | Remove Ticket Tool, MonitoRSS/Streamcord, Helper.gg and the remaining community specialists | A guild replaces four bots; KB deflection cites a source, a feed posts once, a structure backup restores, the dashboard shows 90-day charts |
| **P9 Music and voice** | 3 (parallel) | Finish the only major specialist category left | An operator starts a local Lavalink v4 node and `/music play` works; node failure refuses clearly |
| **P10 Launch** | 4 | Ship a v1.0 a stranger can run and learn from | Clean VM, one command, bot online, dashboard up, `/setup doctor` green; a stranger ships a module in an afternoon |
| **P11 Scale and reliability** | 5 | Survive 2,500+ guilds and a real incident | A 2,500-guild load test at target p95; a shard failover; a restore drill; an incident drill inside 30 minutes |
| **P12 Category leadership** | ongoing | Turn parity into a lead | Quarterly competitive scorecard; three capabilities no surveyed competitor has; community translations and an SDK |

### 0.6 What "better than all the rest" will mean, measurably

Not "more commands". These are the promised outcomes:

1. **A server can delete every other bot and lose nothing it used daily.** The
   parity matrix is green for moderation, automod, security, leveling, economy,
   community, tickets, content, events, forms, modmail, invites and analytics.
2. **A server can leave with everything.** Full export, readable formats, a
   checksum, a receipt, and a restore that another instance can consume.
3. **A moderator can explain and undo every action.** Evidence, case timeline,
   appeal, review, false-positive feedback and a reversible action.
4. **An operator can self-host in one command with no paid dependency.**
5. **A learner can read the code, run the tests and ship a module in an
   afternoon.**
6. **The bot is still alive next year.** Open source, DCO, documented
   succession, no single-vendor dependency for core features.

### 0.7 What we will not do

- No plugin marketplace of unreviewed code.
- No feature-count marketing ("500 commands").
- No per-server lifetime licence.
- No bundled YouTube/Spotify streamer.
- No AI that punishes autonomously.
- No dashboard-only features.
- No mass DM, scraping, self-bots or NSFW.
- No "custom bot identity" upsell; per-server bot profiles are now a Discord
  platform feature (October 2025) and will be used free.
- No retroactive re-gating. Ever.
- No second settings store, second analytics source or second case file.

---

## 1. Method and evidence

### 1.1 What was read

This plan is built on four layers of evidence:

1. **The repository**: `AGENTS.md`, the machine files, all mission pages, the
   parity matrix, the architecture pages, the module status pages, the newest
   journal and the memory tooling.
2. **Official vendor pages** where they rendered: ProBot pricing, Ticket Tool
   docs, MEE6 wiki, YAGPDB, Red-DiscordBot, Lavalink, Discord developer docs.
3. **Third-party teardowns and comparisons**: the internal 2026 competitor pages,
   PeakBot's pricing comparison, YourBot's 2026 guide, Apollo's pricing news,
   and the specialist reviews.
4. **The project's own research ledger**: `research.json` claims R-001 to R-020,
   each with source, retrieval date, confidence and expiry.

### 1.2 What was not verified

- Most pricing pages are client-rendered; several prices are third-party
  observations, not vendor-confirmed. They are labelled **medium** or **low**.
- No competitor bot was installed or exercised for this plan. Feature claims are
  documentation claims, not hands-on tests.
- Public server counts are noisy and often stale. They are used for market shape,
  never for a marketing claim.
- The AI-native entrants are mostly SEO-driven; their feature claims are
  **vendor marketing** until independently verified.
- Discord's channel-obfuscation date and privileged-intent threshold come from
  the project's platform research, not a fresh portal test.

### 1.3 The evidence rule

Every external claim in a governed page carries a source, a date, a confidence
and an expiry. A claim older than two quarters is a rumour. A cell marked ❔ in
[[Parity-Matrix]] never appears in marketing. The plan therefore separates
**what is known**, **what is claimed** and **what must be re-checked before
launch**.

### 1.4 Research questions this plan answers

1. Which bots does a 5,000-member server actually run, and why?
2. What does each one do better than a generalist, and what does it charge?
3. Which of those jobs can Keystone absorb without becoming a monolith?
4. Where is the real white space: features, trust, operations or distribution?
5. What must be true for a server to choose Keystone and never come back?
6. What must be true for a contributor to trust the project in a year?

---

## 2. Market map

### 2.1 The generalists

| Bot | Reported scale | Free tier reality | Paid shape | Strength to copy | Weakness to beat |
| --- | --- | --- | --- | --- | --- |
| **MEE6** | ~21M servers (older public ranking) | Leveling basics, welcome, starboard; moderation, automod, reaction roles, custom commands and many levels features are Premium | ~$11.95/month per server; yearly/lifetime; AI separate | Onboarding clarity, level card, brand | Retroactive re-gating; per-server pricing; cannot be the only bot |
| **Dyno** | ~10.6M servers | Broad moderation, 19 automod filters, logs, autoroles, custom commands, 1 ticket panel, 3 giveaways | Standard ~$5.99, Premium ~$7.99, Custom ~$12.99 per server | Modular dashboard, automod breadth, stability | No reaction roles; leveling paid; some premium needs a second bot |
| **Carl-bot** | ~12.1M servers | 250 reaction roles, 5 YouTube / 2 Twitch feeds, 100 webhook log entries, basic embeds/tags/starboard/moderation | Patreon, ~$7.99 / $12.99 / $16.99 for 1 / 2 / 3 servers | Best-in-class reaction roles; transferable premium; Drama Watcher review queue | No leveling at all; logging caps; steep configuration |
| **ProBot** | 10.2M servers (official) | Welcome images, logs, moderation, social commands, autoroles, starboard, reaction roles, invites | $5/month Tier 1, $10/month Tier 2; yearly discounts; custom bot identity | Welcome images, invite attribution, presentation | Thin leveling; overlap with other generalists; no export |
| **Arcane** | Large leveling specialist | Message XP, role rewards, leaderboards; some voice XP/limits premium | ~$5–$10/month | Leveling depth, counters, social alerts | Not a full admin bot; voice XP friction |
| **YourBot** | Newer, beta | Ten services, marketplace plugins, AI plugin builder, custom identities | Subscription per server; marketplace plugins may be developer-priced | AI-assisted setup, plugin sandbox, service modularity | Beta maturity; marketplace trust; unverified scale |
| **PeakBot** | Newer AI-native | "30+ features", AI Server Builder, moderation, leveling, tickets, analytics | ~$8.25/month Pro; free tier marketed as generous | AI onboarding, single-bot framing, pricing comparison content | Vendor marketing; unverified reliability and data posture |
| **Wick** | Large security specialist | Core anti-nuke/anti-raid, heat automod, join gate, lockdown | Premium ~$5, VIP ~$20 (third-party) | Security depth, join gate, incident framing | Opaque pricing; not a community bot |
| **Security Bot** | Large security specialist | Anti-nuke, anti-raid, captcha, verification | Premium ~$3.50/month; custom identity extra | Free core security, captcha gate | Single-purpose; no community record |
| **Ticket Tool** | 4.63M+ active servers (official) | Panels, private tickets, transcripts; premium unlocks analytics/retention and faster shards | ~$8/month | Ticket depth, panel UX, staff workflow | Single-purpose; paid analytics; no unified member record |
| **Helper.gg** | Support specialist | Panel-based tickets, web dashboard, AI replies, staff subaccounts | Subscription tiers | Browser-based agent workflow, AI replies | Ticket-only; separate support surface |
| **Statbot** | 670k+ communities (official) | Counters, core analytics, dashboards; longer history/export premium | Premium tiers | Analytics clarity, counters, auto roles | No moderation, tickets, leveling or actions |
| **Apollo / Sesh** | Event specialists | Events, RSVP, reminders, time zones, calendar links; recurring events/waitlists premium | Apollo ~$7.99/month or $69.99/year; Sesh ~$6.99/$24.99 | Calendar polish, timezone handling, reminders | Events-only; recurring/timezone features paywalled |
| **Jockie Music** | Music specialist | Multi-source playback, queues, playlists, multiple instances | Free + Patreon boosts | Music depth and stability | Legal/source risk; single-purpose |
| **UnbelievaBoat** | Economy specialist | Currency, shop, gambling, jobs, moderation, reminders | Free + premium | Economy depth and admin tools | Not a full community bot |
| **Tatsu** | 1.35M servers (official) | XP, profiles, economy, pets, stores, leaderboards | Free + premium | Gamification and profile identity | Not an administration system |
| **Lurkr** | Leveling specialist | Free message/voice XP, role rewards, MEE6 import | No-paywall positioning; premium helps limits | Leveling depth without a paywall | Single-purpose |
| **ModMail** | Open-source specialist | Self-hosted DM-to-staff inbox, threads, logs | Free/self-host | The DM relay pattern | Operational burden; no community suite |
| **MonitoRSS / Streamcord** | Feed specialists | RSS/Atom; Twitch/YouTube/Kick alerts; free feed caps | Free + premium | Feed dedupe, delivery speed, source coverage | Single-purpose; source API limits |
| **GiveawayBot** | Open-source specialist | Giveaways, requirements, reroll | Free | Giveaway reliability and entry requirements | Single-purpose |
| **Suggestions.gg / FeatureVote** | Feedback specialists | Suggestions, voting, status tags | Free + premium | Feedback pipeline and decision states | Single-purpose |

**Pattern:** the generalists sell breadth, the specialists sell depth, and the
server pays twice — once in money, once in the integration tax between partial
member records.

### 2.2 What each specialist proves

| Job | Specialist proof | What a generalist must reach | Keystone plan |
| --- | --- | --- | --- |
| Leveling | Lurkr/Arcane give free voice XP and role rewards | XP curve, multipliers, voice XP, rank card, imports, seasonal archive | Role persistence, voice XP, rank image, more importers |
| Economy | UnbelievaBoat/Tatsu give shops, jobs, games, profiles | A ledger that cannot double-spend, plus enough fun to use | Shop/inventory UI, jobs, capped games, ledger viewer |
| Tickets | Ticket Tool/Helper.gg give panels, claims, SLAs, transcripts, AI | Thread tickets, forms intake, KB, deflection, SLA, search | KB, AI deflection with citations, transcripts search |
| Security | Wick/Security Bot/Double Counter give anti-nuke, anti-raid, captcha | Heat scoring, quarantine, join gate, structure restore | Captcha port, alt heuristics, structure snapshots |
| Analytics | Statbot gives counters, charts, history, exports | Source-counted aggregates, charts, cohorts, retention | Daily rollups, SVG charts, CSV, anomaly alerts |
| Music | Jockie gives multi-source playback and instances | BYO Lavalink, queue, DJ, filters, health | Lavalink v4 adapter, DAVE, playlists |
| Feeds | MonitoRSS/Streamcord give fast, deduped delivery | RSS/Atom, YouTube, Twitch, Kick, filters | `/feed`, dedupe, per-source backoff |
| Events | Apollo/Sesh give calendars, RSVP, reminders, timezones | Recurring events, waitlists, ICS, calendar sync | RSVP buttons, scheduled reminders, ICS, Google Calendar later |
| Giveaways | GiveawayBot gives requirements and rerolls | Entries, requirements, reroll, audit | Requirements, reroll, signed entry ids |
| Suggestions | Suggestions.gg gives votes and status tags | Submit, vote, decide, publish | Suggestion board and decision log |
| Backups | Xenon gives structure snapshots | Roles/channels/permissions snapshot and restore | Structure snapshot with dry-run diff |
| Verification | Double Counter gives alt/VPN checks | A privacy-respecting gate | Local challenge + optional provider port |

### 2.3 Open-source prior art

| Repo | Stack | Idea worth copying | Failure to avoid |
| --- | --- | --- | --- |
| **Red-DiscordBot** | Python / discord.py | Cogs as a registry; in-Discord install; approved-spec gate | Hot-loading arbitrary third-party code |
| **YAGPDB** | Go / Postgres / Redis | Separate bot, web and feed processes; a first-class web panel | Heavy self-host prerequisites |
| **ModMail** | Python / MongoDB | DM relay as a shared inbox | Operational burden and no suite |
| **iHorizon** | TypeScript / Bun | 390+ commands, Lavalink, backup, ten locales | Canonical repo on GitLab; GitHub issues disabled |
| **TSCord** | TypeScript | Declarative guards, migrations, CLI scaffolding | Template stalled; DI ceremony |
| **MASZ** | C# + Svelte | Bot + dashboard + REST API + plugins | Maintainer abandonment |
| **Skyra** | TypeScript | Typed i18n and command design | README discourages self-hosting |
| **NadekoBot** | C# | Classic all-in-one breadth | CLA assigns copyright |
| **Auttaja** | Go / Kubernetes | Distributed shard manager | Over-engineered; dead since 2019 |

**Lessons:** keep the registry, not a switch; keep the process split; keep guards
as middleware; keep the DCO and no CLA; make the dashboard optional; make
self-host one command; never make a marketplace of unreviewed code the growth
model.

### 2.4 The 2026 AI-native wave

| Product | Claimed wedge | What is real | What Keystone should do |
| --- | --- | --- | --- |
| **PeakBot** | AI Server Builder; 30+ all-in-one features; free tier; ~$8.25 Pro | Setup speed and aggressive comparison marketing | Ship a schema-validated AI config planner that previews a diff and applies only on approval |
| **YourBot** | Ten services, marketplace plugins, AI Plugin Builder, custom identities; beta | Service modularity and AI-assisted creation | Keep the module contract and generator; never a marketplace |
| **Helper.gg** | Panel tickets + web dashboard + AI replies | Browser-based agent workflow | Make the dashboard a real support console, not a settings page |
| **Wallu / Relayn / Atis / Quickchat** | Knowledge-base answers, handoff, analytics | AI support is now a category | KB, citations, handoff, feedback, eval, caps |
| **Onyx / Mava / AI Ticket Bot** | AI-first ticket resolution | Deflection ROI story | Measure deflection honestly; never fake a resolution |

The AI wave changes buyer expectations in two places: **setup** ("build my
server") and **first response** ("answer this ticket"). It does not change the
trust requirements. A bot that answers fast but cannot say why, cannot be
audited, or leaks data is worse than a slower one. Keystone's answer is
**AI with receipts**: local-first, cited, capped, zero-retention by default and
human-approved for anything destructive.

### 2.5 Platform shifts that shape the plan

| Shift | Date / source | Consequence |
| --- | --- | --- |
| **Components V2** | Discord docs, 2025–2026 | 40 components per message; ~4,000 characters; flag irreversible; defer-then-edit; modals use Label/TextDisplay, File Upload/Radio/Checkbox |
| **Per-server bot profiles** | Discord newsletter, October 2025 | White-label identity is platform-native; do not sell it; use it free |
| **Command limits** | Discord docs | 100 global chat-input, 15 user + 15 message menus, 8,000-character payload including localisations |
| **Privileged intents** | Discord support, 2026 | 10,000-user threshold and annual review; slash-first; minimal intent profile |
| **Sharding** | Discord gateway docs | Required at 2,500 guilds; 2,500 per shard; 50 req/s global; 120 events/60s per connection; 10,000 invalid requests/10 min |
| **Voice / DAVE** | Discord voice docs; Lavalink v4 changelog | Voice encryption is becoming required; a music adapter must support DAVE |
| **Channel obfuscation** | Project research, scheduled 2026-11-16 | Hidden channels vanish from HTTP and arrive nulled; every lookup goes through `resolveChannel()` |
| **Activities** | Discord docs, opened to all developers 2025 | Optional P12 experiment; verify eligibility; do not block launch |
| **Premium Apps monetisation** | Discord docs | If monetised anywhere, an equivalent Discord purchase is required; free core avoids the problem |
| **App verification / directory** | Discord portal | 100+ guilds needs verification; the App Directory is a distribution channel, not a feature |

### 2.6 What the market punishes

- **Retroactive re-gating.** The most-cited complaint about MEE6. A setting an
  admin configured becoming read-only is a breach of trust, not a paywall.
- **Per-server billing.** Multi-server communities pay twice; the stack tax is
  the switching trigger.
- **Data lock-in.** BotGhost's shutdown and MEE6's deletion complaints are the
  cautionary tales.
- **Outages and support silence.** A bot that is down during a raid is worse than
  no bot.
- **False positives.** Substring filters, noisy AI moderation and auto-timeouts
  punish regulars. The July 2026 reports of Discord's own AI moderation matching
  spreadsheets and game textures are the extreme case.
- **Dashboard/command parity.** A setting that exists in the dashboard but not
  the command (or vice versa) is a support ticket.
- **Abandonment.** Groovy and Rythm died within a month; Loritta went
  closed-source in 2026. Users remember.

### 2.7 What the market rewards

- **Setup speed.** A working server in ten minutes beats a feature list.
- **Visual polish.** Level cards, welcome images and clean panels are retention.
- **Reliability.** Uptime is a feature; status pages and incident notes build
  trust.
- **Free breadth.** A genuinely usable free tier is distribution.
- **AI that resolves.** Not a persona; a knowledge-grounded answer with a
  handoff.
- **Migration help.** "Leave MEE6 without losing XP" is a better ad than "we have
  more features".
- **Teaching.** The self-host and open-source audience rewards legibility.

### 2.8 The white space

Twelve unmet needs, ranked by defensibility:

1. **A complete, documented export of a guild's own record** — no surveyed
   generalist does it.
2. **A real exit guarantee** — import, rollback, receipt, drift, structure
   snapshot, readable formats.
3. **Audit-grade retention** — per-category retention, deletion receipts,
   privacy dashboard, no content by default.
4. **Explainable moderation at bot level** — evidence, dry-run, appeal, undo,
   false-positive loop.
5. **AI with citations and zero retention** — not a persona; a knowledge tool.
6. **An API and webhooks on the free tier** — competitors gate them to top plans.
7. **Cross-bot migration as a first-class product** — not a docs page.
8. **Structure backup and restore** — Xenon/Wick sell it; generalists do not.
9. **One member timeline** — cases, tickets, invites, levels, economy, forms,
   events, modmail and AI labels in one view.
10. **Local-first AI** — Ollama and BYO providers, no mandatory vendor.
11. **Teachability** — a real course, not a docs dump.
12. **One-command self-host with no paid dependency** — YAGPDB's power without
    YAGPDB's ops burden.

---

## 3. Keystone's position

### 3.1 Domain scorecard

| Domain | Rows shipped | Live rows | Strongest asset | Largest gap |
| --- | ---: | ---: | --- | --- |
| Moderation | 11/13 | 1 | Case file, evidence, appeals, dry-run | Case export, undo, false-positive loop |
| Automod | 9/10 | 2 | Link/profanity/zalgo filters, native plan, test mode | False-positive report, rule simulator |
| Security | 9/9 | 1 | Anti-nuke, anti-raid, quarantine, panic, join gate | Captcha/alt detection, structure restore |
| Leveling | 7/7 | 0 | XP projection, rewards, seasons, MEE6 import | Voice XP, role persistence, rank image |
| Economy | 5/5 | 0 | Append-only ledger, idempotency, guild lock | Games/shop depth, ledger viewer |
| Community | 11/12 | 8 | Role panels, giveaways, suggestions, polls, temp voice | Social feeds, welcome images |
| Tickets | 6/7 | 1 | Thread tickets, claims, transcripts, stats | Knowledge base, AI deflection proof, search |
| Content | 6/6 | 0 | Embeds, tags, schedules, reminders, sticky, RSS | Feed depth, embed builder UX |
| Music | 1/2 | 1 | Durable queue, explicit refusal | Playback (Lavalink v4, DAVE) |
| AI | 6/7 | 1 | Provider abstraction, caps, zero retention, RAG | pgvector ANN, KB UX, eval harness |
| Operations | 13/15 | 10 | OAuth/session hardening, tokens, webhooks, idempotency | Live OAuth, status page, dashboard UX |
| Portability | 12/12 | 6 | Export/import/rollback/drift/receipts | NDJSON, structure snapshot, more importers |
| Invites | 3/3 | 0 | Attribution, fake-join flags, leaderboard | Live join proof |
| Forms | 3/3 | 3 | Forms, submissions, review, export | Modal input, conditional fields |
| Events | 2/4 | 1 | Lifecycle, RSVP row, capacity transaction | Buttons, scheduled reminders, ICS |
| Modmail | 5/6 | 5 | Private threads, claim, transcript, stats | DM/thread relay, attachments, search |
| Parity extras | 2/6 | 1 | Auto-responder, analytics | Role persistence, captcha, calendar, activities |

### 3.2 Strengths to protect

1. **The record is real.** One settings store, one case file, one economy ledger,
   one audit trail, one export port. This is the architectural moat.
2. **The gates are real.** `pnpm check` runs typecheck, 644 tests, budget, claims,
   intents, channels and memory, token-free.
3. **The component router is real.** Every component id is signed and expiring;
   the router checks kind, signature, expiry, guild and permission before a
   handler runs.
4. **The dashboard security model is real.** OAuth/PKCE, opaque sessions,
   BigInt per-guild authorization, CSRF, rate limits, scoped tokens, signed
   webhooks and idempotency are not a demo.
5. **The teaching trail is real.** Specs, status pages, teaching notes, ADRs,
   journals and a memory gate that reads prose.
6. **The portability wedge is real.** No surveyed generalist has it.

### 3.3 Liabilities to close

1. **Live proof is thinner than the claim.** 48 rows marked live, 23 with named
   evidence, and the probe uses fake OAuth. The vocabulary must become honest.
2. **The dashboard is functional, not delightful.** It is a framework-free HTML
   app; it needs mobile, charts, empty states, bulk actions and a support console.
3. **Specialist depth is missing in five visible places:** music playback, feeds,
   analytics history, welcome images and structure backup.
4. **The P7 tail is not finished:** remaining reply copy, role persistence, case
   export, event buttons/reminders/ICS, forms modal, modmail relay, false-positive
   reporting.
5. **The command payload is near a wall:** `/tools` is 7,485 of 8,000 characters,
   so the next large feature needs a new root or a split.
6. **Scale is unproven:** no sharding, no load test, no SLOs, no status page, no
   cost-per-1,000-guilds model.
7. **Distribution is unproven:** no docs site, no installer, no listings, no demo
   server, no migration campaign.
8. **The memory has drift** (see [[Memory-Audit-2026-11-03]]). It is fixable, and
   P7.5 fixes it.

### 3.4 Competitive scenarios

| Scenario | Likely move | Keystone response |
| --- | --- | --- |
| MEE6 makes reaction roles free | Closes its biggest gap | Do not chase; win on export, appeals, API and self-host |
| Dyno adds leveling | Becomes a fuller generalist | Win on the shared record and the free union, not on XP alone |
| Carl-bot adds leveling | Same | Win on tickets, AI, analytics and portability |
| An AI-native bot gets App Directory distribution | Setup-speed pressure | Ship the AI config planner and a ten-minute activation demo |
| Wick adds community features | Security-led expansion | Win on the unified case/ticket/member timeline and transparency |
| Ticket Tool adds AI deflection | Support pressure | Win on KB citations, zero retention, no per-resolution fee and a unified record |
| Discord adds native leveling/tickets/analytics | Platform absorption | Win on depth, portability, appeals, automation and the API |
| Discord raises intent thresholds | Feature loss risk | Keep the minimal intent profile; make every privileged feature optional |
| A security breach hits a competitor | Trust shock | Publish our threat model, retention table and incident runbook; do not exploit a breach |

### 3.5 SWOT

**Strengths:** union breadth, record architecture, portability, auditability,
token-free tests, memory gate, teaching trail, free-core policy.

**Weaknesses:** specialist depth gaps, dashboard UX, live proof, scale proof,
distribution, one-maintainer risk.

**Opportunities:** AI-native setup, support deflection, data-ownership wedge,
self-host market, migration fatigue, Discord's own native features creating
integration work.

**Threats:** platform changes, AI cost/quality, security breach, legal risk in
music, competitor bundling, contributor burnout, free-tier abuse.

---

## 4. Strategy

### 4.1 The promise

> **Keystone is the last Discord bot a server has to install — and the only one
> it can leave with everything.**

Three sentences a stranger can repeat:

1. **One bot, one record.** Moderation, tickets, levels, invites, economy,
   forms, events, modmail, logs and AI share one member record.
2. **Free, forever.** Every shipped feature is free. Hosting convenience is the
   only thing anyone may ever sell.
3. **Provable and portable.** Every action has evidence, every setting has an
   audit row, and the whole guild exports with a checksum.

### 4.2 The ten moats, in build order

#### M1 — One record

Build a `member_timeline` read model that joins, by guild and user:

- cases and case events
- tickets and ticket messages
- invite joins and leaves
- levels and XP events
- economy ledger entries
- form submissions
- event RSVPs
- modmail threads
- logging events that mention the member
- AI labels and explanations (advisory only)

The timeline is a **read model**, not a new source of truth. It is built from the
existing stores through one kernel port, exposed in `/mod history`, the user
context menu, the dashboard and `GET /api/v1/guilds/:id/members/:userId/timeline`.
It obeys per-guild authorization and retention. It is the single most important
feature in this plan because it turns the union from a bundle into a product.

**Acceptance:** a moderator can answer "what happened with this member?" in one
screen, with links to the case, ticket, invite and transcript; every row names
its source table and timestamp; the export includes the same rows.

#### M2 — Exit guarantee

- Export v2: NDJSON streams for large guilds, JSON for small ones, attachments
  where the platform allows, a manifest with counts and SHA-256.
- Import from MEE6, Dyno, Carl-bot, ProBot, Ticket Tool, Lurkr, Arcane, Atom,
  Cakey, Xenon structure files, our own v1/v2 bundles.
- Structure snapshot: roles, channels, categories, permissions, AutoMod rules,
  and (optionally) pinned messages; restore with a dry-run diff.
- Rollback window, deletion receipt, drift report and a "leave score" that shows
  what is still trapped in another bot.
- A public "Export" page and a CLI.

**Acceptance:** export a 5,000-row guild, wipe it, restore it into a clean guild,
and match counts, checksum and config hash; a failed restore leaves the guild
untouched; a deletion produces a receipt.

#### M3 — Explainable, reversible moderation

- Evidence card: what triggered the rule, the message excerpt, the rule version,
  the heat score and the channel context.
- Dry-run default; per-rule punishment; review queue; appeal from the same
  message; `/appeal open | status`.
- False-positive report button on every automated case; feeds the rule's own
  precision metric.
- Undo: revert a ban/kick/timeout/role change where the platform allows, or
  record an explicit "cannot undo" with the reason.
- Case timeline, bulk case actions, notes and exports.
- AI triage is advisory and cited; no autonomous punishment.

**Acceptance:** a false positive is reported, the rule's precision changes, a
reviewer reverses the case, and the member timeline shows the original action,
the report, the reversal and the reason.

#### M4 — Free forever

- Every shipped feature is free on every server.
- No cap exists only to sell an upgrade.
- No retroactive re-gating; a feature that becomes free stays free.
- Hosted convenience (managed uptime, backups, AI credits at cost, custom
  identity) may be sold outside this repo, never a feature self-hosters cannot
  have.
- Publish a public pricing promise and a changelog entry whenever a limit changes.

**Acceptance:** the pricing page and the feature matrix are generated from the
same data; a test fails if a premium flag is added to a module manifest.

#### M5 — Ops-grade API

- REST `/api/v1` with OpenAPI 3.1 generated from a route table.
- Scoped tokens, per-token limits, guild binding, audited issue/revoke.
- Signed webhooks with retries, receipts and replay protection.
- `Idempotency-Key` on writes.
- A TypeScript SDK generated from OpenAPI.
- A public status page and changelog feed.
- API access on the free tier; no "API is a top-plan feature".

**Acceptance:** a token for guild A cannot read guild B; a repeated POST returns
the same bytes; a webhook receiver can verify the signature; an SDK example runs
against localhost.

#### M6 — AI with receipts

- Local-first default (Ollama or any OpenAI-compatible endpoint), BYO provider.
- Per-guild dollar and request caps checked before the call.
- Zero retention by default: no prompts or completions stored.
- Citations for RAG answers; "no source, no answer" for KB deflection.
- Human approval for any action; AI may recommend, never punish.
- Prompt-injection tests; tool-use allowlist; output redaction.
- An eval harness with a golden set, precision/recall, cost and latency.
- An AI config planner that proposes a schema-validated settings diff, previews
  it and applies only on approval.

**Acceptance:** a KB answer cites its document; a no-match question hands off
without a model call; a prompt-injection fixture cannot exfiltrate another
guild's doc; a cap refusal happens before the provider call.

#### M7 — Data lifecycle

- A published retention table per category.
- Per-guild retention settings bounded by the table.
- A privacy dashboard: what is stored, where, for how long, and how to delete it.
- Deletion receipts and a real delete path (not anonymisation that keeps the row).
- Minimal message content by default; transcripts opt-in with a clear warning.
- A DPA/data-processing page and a subprocessor list (none by default).

**Acceptance:** an admin can see every category, change a retention window, delete
a category, and receive a receipt; a test proves the rows are gone.

#### M8 — Zero-to-value

- `/setup doctor`: permissions, intents, channels, roles, webhook, database,
  Redis, AI provider, Lavalink, timezone, locale.
- Import wizard with a dry-run diff and a receipt.
- Built-in templates and saved templates (already shipped).
- An AI config planner with preview and approval.
- A "replace MEE6" checklist that maps each feature to its Keystone equivalent.
- A dashboard onboarding checklist and a demo guild.

**Acceptance:** a new admin reaches a working moderation + welcome + leveling
setup in ten minutes, sees the exact diff before any write, and can undo it.

#### M9 — Reliability and scale

- Sharding at 2,500 guilds; shard-aware queue jobs; per-shard metrics.
- 50 req/s budget, invalid-request circuit breaker, 429 backoff.
- Idempotent jobs, dead-letter queue, retries with jitter.
- SLOs: p95 interaction ack < 1s; handler < 250ms excluding IO; dashboard p95
  < 300ms; feed poll < 5 min; analytics query < 500ms.
- Load tests at 2,500 guilds; chaos drills; backup/restore/deletion drills.
- Status page, incident runbook and postmortems.
- Cost per 1,000 guilds.

**Acceptance:** a simulated 2,500-guild load meets the SLOs; a shard restart
reconnects without duplicate jobs; an incident drill completes inside 30 minutes.

#### M10 — Teachability

- A docs site generated from the vault (Astro Starlight or equivalent, free).
- Twenty lessons, each with a runnable proof and an exercise.
- `pnpm module:new` generator and an import-boundary lint.
- API reference and SDK examples.
- Contributor ladder, good-first-issues, DCO, no CLA.
- Community translations with a typed catalog and a coverage test.

**Acceptance:** a stranger clones the repo, gets the gate green without a token,
and ships a module in an afternoon; the docs build with zero warnings; a
translation PR cannot drop an interpolation.

### 4.3 Positioning against each competitor

- **Against MEE6:** "Keep your levels if you leave. MEE6 cannot export them;
  Keystone can." Do not argue about level-card art; win on ownership and price.
- **Against Dyno:** "Same moderation discipline, plus the community, tickets,
  levels and AI in one record." Win on the union and the audit trail.
- **Against Carl-bot:** "Reaction roles plus the rest of the server, with logs
  that do not expire." Win on tickets, AI and portability.
- **Against ProBot:** "Welcome images and invites, plus moderation, levels and a
  real API." Win on depth and data ownership.
- **Against Ticket Tool / Helper.gg:** "Tickets are part of the member record, not
  a separate silo; transcripts, KB and AI handoff are free." Win on integration.
- **Against Wick / Security Bot:** "Security shares the case file, the appeal and
  the member timeline; no second invoice." Win on integration and transparency.
- **Against Statbot:** "Analytics over the same ledgers that run the bot; source
  counts, no invented metrics, CSV export." Win on trust.
- **Against Jockie:** "BYO Lavalink, no bundled streamer, no legal surprise; the
  queue is part of the server record." Win on legality and integration.
- **Against Apollo/Sesh:** "Events are part of the community record; ICS and
  reminders are free." Win on integration.
- **Against MonitoRSS/Streamcord:** "Feeds are one module, not a second bot;
  dedupe, backoff and a review queue." Win on integration.
- **Against the AI-native wave:** "AI that cites, caps, forgets and asks before it
  acts." Win on trust.

### 4.4 What we say no to

- A plugin marketplace of unreviewed code.
- Feature-count marketing.
- Per-server lifetime licences.
- A bundled streamer.
- AI that punishes.
- Dashboard-only features.
- Mass DM, scraping, self-bots, NSFW.
- Paid custom identity; per-server profiles are free.
- A second settings store, analytics source or case file.
- A blockchain/NFT/crypto economy.
- Loot boxes or uncapped gambling.
- A mobile native app before the PWA proves demand.

---

## 5. Feature plan by domain

Each feature names the bot it removes, the phase, the data/command surface and
the proof. "Proof" means a test, a live probe check or both. A feature with no
proof is not done.

### 5.1 Moderation and safety

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Case export (JSON + CSV) | Dyno/Carl gap | P7.5 | `/mod case export` | Round-trip test; CSV schema test |
| False-positive report | Nobody (our edge) | P7.5 | Button on automated case | Report writes a case event; precision counter test |
| Undo / revert case | Nobody (our edge) | P8 | `/mod case undo` | Ban/kick/timeout/role revert where possible; explicit refusal otherwise |
| Member timeline | Nobody (our edge) | P8 | `/mod history`, user menu, dashboard, API | Timeline joins five stores; authorization test |
| Member notes | Dyno | P8 | `/mod note add/list` | Append-only note rows; case export includes them |
| Case search | Dyno | P8 | `/mod case search` | Query by user, rule, state, date; bounded results |
| Bulk case actions | Dyno | P8 | `/mod case bulk` | Preview + confirm; audit row per case |
| Appeal SLA | Nobody | P8 | `/appeal status`, dashboard | Age, first response, resolution time |
| Evidence attachments | Nobody | P8 | Case evidence card | Attachment metadata only; no content by default |
| AI triage | Nobody | P12 | Review queue | Advisory label + citation; eval threshold |

### 5.2 Automod

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| False-positive loop | Nobody | P7.5 | Report button | Rule precision metric, review queue |
| Rule simulator | Dyno/Carl gap | P8 | `/mod simulate` | Replay last N messages against a rule; no action |
| Per-channel context | Dyno/Carl gap | P8 | Settings | Exempt channels/roles; test fixtures |
| Native AutoMod two-way sync | Nobody | P8 | `/mod automod sync` | Read/write Discord rules; diff; idempotent |
| Link allowlist by role | Dyno | P8 | Settings | Role-aware allowlist test |
| Image hash filter | Nobody | P12 | Scanner | Perceptual hash window; opt-in; privacy note |
| AI classification eval | MEE6 AI | P12 | Advisory | Precision/recall on a golden set; no action path |

### 5.3 Security and verification

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Join-gate expiry | Wick/Security Bot | P7.5 | Settings + timer | Quarantine expires; audit event |
| Captcha provider port | Security Bot/Double Counter | P8 | `/verify captcha` | Local challenge + optional operator provider; token-free tests |
| Alt-account heuristics | Double Counter | P8 | Join flags | Account age, avatar, invite; no IP/device by default |
| Anti-nuke allowlist | Wick | P8 | Settings | Per-actor/per-action thresholds; dry-run |
| Structure snapshot | Xenon/Wick | P8 | `/export structure` | Roles/channels/permissions diff; restore into a clean guild |
| Incident timeline | Wick | P8 | Dashboard | Joins, audit actions, cases, panic state in one view |
| Panic scheduling | Wick | P8 | `/mod panic schedule` | Timed lockdown with restore; audit |
| Security report | Nobody | P8 | `/setup security` | Permission gaps, risky roles, open DMs, webhook inventory |

### 5.4 Leveling

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Role persistence | Carl premium | P7.5 | Settings | Snapshot on leave; restore on rejoin; opt-in; audit |
| Voice XP | Lurkr/Arcane | P8 | Settings | Voice-state minutes; anti-idle; cap |
| XP multipliers UI | MEE6 | P8 | `/rank multiplier` | Role/channel/event multipliers; precedence test |
| Rank card image | MEE6/Arcane | P8 | `/rank view` | Local render; no external service; V2 fallback |
| Seasonal archive UI | Arcane | P8 | `/rank season` | Archive + reset; export; no data loss |
| More importers | Lurkr/Arcane/Atom/Cakey | P8 | `/setup import` | Fixture per format; checksum; dry-run |
| Leaderboard cache | MEE6 | P8 | `/rank leaderboard` | Pagination; cache invalidation |

### 5.5 Economy

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Shop UI | UnbelievaBoat | P8 | `/rank shop` | Items, stock, role grants, audit |
| Inventory | UnbelievaBoat | P8 | `/rank inventory` | Owned items; use/consume; idempotent |
| Jobs | UnbelievaBoat | P8 | `/rank work` | Cooldown, payout, ledger row |
| Capped games | UnbelievaBoat/Tatsu | P8 | `/rank games` | Opt-in, cap, serialized debit |
| Ledger viewer | Nobody | P8 | Dashboard + `/rank ledger` | Source rows, running balance, export |
| Economy import/export | Nobody | P8 | `/export economy` | Checksum; idempotent merge |

### 5.6 Community and engagement

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Welcome image card | ProBot | P8 | `/tools welcome` | Local image render; V2 text fallback; no external service |
| Social feeds | MonitoRSS/Streamcord | P8 | `/feed` | RSS/Atom, YouTube, Twitch, Kick; dedupe; backoff |
| Starboard upgrades | Carl | P8 | `/tools starboard` | Per-channel thresholds; ignored channels; edits |
| Temp voice controls | Arcane/MEE6 | P8 | `/tools voice` | Rename, limit, lock, transfer; owner leave |
| Stat channel rate limits | Statbot | P8 | Settings | 10-minute floor; permission precheck; failure note |
| Birthday timezones | MEE6 | P8 | `/tools birthday` | Per-member timezone; schedule; dedupe |
| Suggestion board | Suggestions.gg | P8 | `/tools suggest` | Submit, vote, decide, publish; audit |
| Poll upgrades | MEE6 | P8 | `/tools poll` | Multi-select, timed, anonymous option |
| Giveaway requirements | GiveawayBot | P8 | `/tools giveaway` | Role/age/message requirements; reroll |
| Role menu upgrades | Carl | P8 | `/tools roles` | Grouped selects; require/ignore roles; persistence |

### 5.7 Tickets and support

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Knowledge base | Ticket Tool/Helper.gg | P8 | `/ticket kb add/remove/list/search` | Guild-scoped docs; exact + pgvector index; citation |
| AI deflection end-to-end | Wallu/Helper.gg | P8 | Ticket open flow | No source → handoff, no model call; source → cited answer |
| Canned responses | Ticket Tool | P8 | `/ticket canned` | Per-guild snippets; permission gate |
| Intake forms | Helper.gg | P8 | Ticket panel | Form fields; validation; stored answers |
| Transcript search | Ticket Tool | P8 | `/ticket search` | Full-text over transcripts; retention-aware |
| Feedback/rating | Helper.gg | P8 | Close flow | One rating per ticket; aggregate |
| SLA dashboard | Ticket Tool | P8 | Dashboard | First response, resolution, reopen |
| Staff performance | Helper.gg | P8 | Dashboard | Claims, replies, resolution; privacy note |

### 5.8 Content

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Embed builder v2 | Dyno/Carl | P8 | `/tools embed` | Validated fields; preview; no scripting |
| Custom command variables | Carl/YAGPDB | P8 | `/tools tag` | Structured variables; no code execution |
| Scheduled message UI | MEE6 | P8 | `/tools schedule` | Cron/timezone; preview; cancel |
| Sticky messages | Carl premium | P8 | `/tools sticky` | Repost on activity; rate limit; delete |
| RSS feed depth | MonitoRSS | P8 | `/feed` | Filters, dedupe, backoff, failure note |

### 5.9 Forms

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Modal input | Nobody | P7.5 | Form panel | Modal from schema; validation; one pending |
| Forms in guild bundle | Nobody | P7.5 | `/export guild` | Export/import round-trip |
| Conditional fields | Nobody | P8 | Form builder | Field dependencies; validation test |
| Review SLA | Nobody | P8 | Dashboard | Age, decision time, reviewer |
| Form templates | Nobody | P8 | `/form template` | Built-in templates; preview |

### 5.10 Events

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| RSVP buttons | Apollo/Sesh | P7.5 | Event panel | Signed ids; capacity transaction; decline frees seat |
| Scheduled reminders | Apollo/Sesh | P7.5 | `/event remind` | Queue job; one delivery; cancellation |
| ICS export | Apollo/Sesh | P7.5 | `/event export` | RFC 5545; timezone; checksum |
| Recurring events | Apollo/Sesh | P8 | `/event create` | RRULE subset; occurrence rows |
| Waitlist | Sesh | P8 | RSVP flow | Waitlist promotion on decline |
| Timezone display | Apollo | P8 | Event panel | Per-member timezone; locale |
| Google Calendar sync | Apollo | P12 | `/event calendar` | OAuth; sync token; explicit failures |

### 5.11 Modmail

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| DM/thread relay | ModMail/Helper.gg | P8 | Modmail thread | Two-way relay; bot/self filter; idempotent |
| Attachments | ModMail | P8 | Thread | Metadata + size cap; no content archive by default |
| Search | ModMail | P8 | `/modmail search` | Full-text over transcripts; permission gate |
| Canned replies | ModMail | P8 | `/modmail canned` | Snippets; audit |
| SLA/stats | Helper.gg | P8 | `/modmail stats` | First response, resolution, queue age |

### 5.12 Music

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Lavalink v4 adapter | Jockie | P9 | `/music play` | Fake node contract tests; live local node |
| DAVE voice support | Nobody | P9 | Playback | Lavalink v4 + discord.js voice; integration test |
| Queue/playlists | Jockie | P9 | `/music queue` | Persistence; reorder; remove; clear |
| DJ role | Jockie | P9 | Settings | Permission gate; bypass list |
| Filters | Jockie | P9 | `/music filter` | Bounded presets; reset |
| Node health | Nobody | P9 | `/music status` | Latency, players, failure note |

### 5.13 AI

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| pgvector ANN | Nobody | P8 | RAG | 1M×1536 benchmark; p95 recall/latency |
| KB management | Wallu | P8 | `/ai docs` | Add/list/remove; guild scope; citation |
| Eval harness | Nobody | P8 | `pnpm ai:eval` | Golden set; precision/recall; cost/latency |
| AI config planner | PeakBot | P8 | `/setup plan` | Schema-validated diff; preview; approval |
| Prompt-injection tests | Nobody | P8 | Test suite | Cross-guild exfiltration refused |
| Moderation triage | Nobody | P12 | Review queue | Advisory + citation; threshold gate |
| Summaries | Helper.gg | P8 | `/ticket summary` | Cited, bounded, on demand |

### 5.14 Analytics

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Daily rollups | Statbot | P8 | `analytics_daily` projection | Rebuild from source; counts match |
| SVG charts | Statbot | P8 | Dashboard | No chart dependency; accessible |
| Cohort retention | Statbot | P8 | Dashboard | New/retained/left by week |
| CSV export | Statbot | P8 | `/analytics export` | Schema; checksum |
| Anomaly alerts | Statbot premium | P8 | Dashboard | Join/message spikes; no auto-action |
| Retention controls | Nobody | P8 | `/config retention` | Bounded windows; deletion receipt |

### 5.15 Portability

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Export v2 (NDJSON) | Nobody | P8 | `/export guild` | Stream 5k+ rows; checksum; resume |
| Structure snapshot | Xenon | P8 | `/export structure` | Diff/restore; dry-run; rollback |
| More importers | Lurkr/Xenon | P8 | `/setup import` | Fixture per format; receipt |
| Leave score | Nobody | P8 | `/export leave-score` | What is trapped elsewhere; actionable |
| Cross-guild clone | Nobody | P8 | `/export clone` | Template + settings; no member data |
| Receipts UI | Nobody | P8 | Dashboard | Every import/delete/rollback |

### 5.16 Dashboard and API

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Mobile/responsive | Everyone | P8 | HTTP app | 360px, 768px, 1280px checks |
| Onboarding checklist | Everyone | P8 | Dashboard | Activation events |
| Support console | Helper.gg | P8 | Dashboard | Ticket queue, claim, reply |
| Audit viewer | Nobody | P8 | Dashboard | Filters, diff, export |
| Bulk operations | Everyone | P8 | Dashboard | Preview, confirm, audit per guild |
| TypeScript SDK | Nobody | P8 | npm package | Generated from OpenAPI; example |
| OpenAPI docs | Nobody | P10 | Docs site | Build + link check |
| PWA | Nobody | P12 | Dashboard | Installable; offline shell |

### 5.17 Operations and i18n

| Feature | Removes | Phase | Surface | Proof |
| --- | --- | --- | --- | --- |
| Status page | Everyone | P8 | Public page | Health checks; incident notes |
| `/setup doctor` | Everyone | P8 | Command | Permission/intent/DB/Redis/AI/Lavalink checks |
| Sharding | Nobody | P11 | Runtime | 2,500-guild load test |
| SLOs/alerts | Nobody | P11 | Ops | p95, error rate, queue depth |
| Load tests | Nobody | P11 | Scripts | Repeatable; no paid service |
| Security review | Nobody | P11 | Docs | Threat model; checklist |
| Translation completion | Everyone | P7.5 | Catalog | Coverage test; all replies |
| Ten languages/RTL | Everyone | P12 | Catalog | Typed keys; RTL layout test |

---

## 6. Prioritisation

### 6.1 Scoring model

Score each candidate 0–5 on:

- **Uninstall value:** which named bot does it replace?
- **Free-tier fit:** does it work without a paywall?
- **Reversibility:** can it be undone/exported?
- **Budget fit:** roots, components, intents, payload.
- **Teachability:** can a beginner follow it?

Then divide by effort (person-days) and risk (platform/legal/security). A feature
that removes a bot but cannot be exported is not a P0.

### 6.2 The first twelve

1. Memory gate portability + drift fixes (P7.5).
2. Live proof: OAuth, slash, right-click, modal, member join (P7.5).
3. i18n completion (P7.5).
4. Role persistence (P7.5).
5. Case export + false-positive loop (P7.5).
6. Event buttons + reminders + ICS (P7.5).
7. Forms modal + bundle (P7.5).
8. Ticket KB + AI deflection with citations (P8).
9. Social feeds + `/feed` (P8).
10. Modmail relay + search (P8).
11. Structure snapshot + export v2 (P8).
12. Dashboard support console + charts (P8).

### 6.3 Explicit non-goals

- Global economy.
- Translation of member-authored content.
- Bundled music source.
- Lyrics/autoplay.
- AI autonomous punishment.
- Plugin marketplace.
- Native mobile app before PWA demand.
- Blockchain/crypto/NFT.
- Loot boxes/uncapped gambling.
- Mass DM, scraping, self-bots, NSFW.
- White-label as a paid feature.

---

## 7. Command budget v3

### 7.1 Current ledger

The registry holds **20 roots**, **141 subcommands**, **161 actions** and **4
context menus**. The `/tools` payload is 7,485 of Discord's 8,000-character cap.
That is the real constraint on the next feature: adding a large feed surface under
`/tools` risks the payload, not the root count.

### 7.2 The one new root

**`/feed`** — one root, six subcommands: `add`, `remove`, `list`, `test`, `pause`,
`resume`. It owns RSS/Atom, YouTube, Twitch and Kick subscriptions, filters and
delivery state. It is justified because `/tools` is near its payload cap and
because feeds are a distinct daily workflow, not a one-off utility.

No other new chat-input root is planned before v1. The target is **twenty-one
roots**, leaving seventy-nine of Discord's hundred slots free for P12.

### 7.3 Where the rest goes

| Root | Addition | Why no new root |
| --- | --- | --- |
| `/ticket` | `kb`, `canned`, `search` | Ticket hub already owns support |
| `/mod` | `case export`, `case search`, `case undo`, `note` | Moderation hub |
| `/rank` | `voice`, `multiplier`, `shop`, `inventory`, `work` | Leveling/economy hub |
| `/tools` | `welcome-image`, `sticky`, `starboard`, `voice` | Existing utilities, payload checked |
| `/verify` | `captcha`, `provider` | Verification hub |
| `/setup` | `doctor`, `plan`, `import` | Onboarding hub |
| `/config` | `retention` | Settings hub |
| `/export` | `structure`, `leave-score`, `clone` | Portability hub |
| `/analytics` | `retention`, `cohort` | Analytics hub |
| `/event` | `calendar`, `waitlist` | Event hub |
| `/ai` | `eval`, `docs` | AI hub |
| `/form` | `template`, `conditional` | Form hub |

The target is roughly one hundred ninety subcommands and two hundred fifteen
actions, with six context menus (three user, three message). Those are estimates,
not promises; the budget gate is the source of truth.

### 7.4 Context menus

Current four: Report message, Case history, Rank card, Explain with AI. Add:

- **Add note** (user) — a moderation note without opening a case.
- **Save evidence** (message) — attach a message id and a capped excerpt to a
  case.

Target six menus, well inside the separate 15 + 15 budget.

### 7.5 Payload discipline

- Every root's serialised payload is measured in CI.
- A root above 7,000 characters is flagged; above 7,800 it fails.
- New localisations count toward the 8,000-character payload; the German catalog
  is measured too.
- Long descriptions are shortened, not hidden in options.

### 7.6 Deprecation

No command is removed without two releases, a changelog entry and a migration
note. A subcommand can be renamed with an alias for one release. Context menus
can be removed with one release note because they cost no root.

---

## 8. Data model v3

### 8.1 New tables and projections

| Table | Purpose | Owner | Retention |
| --- | --- | --- | --- |
| `feeds` | Subscription, source, channel, filters, state | feeds | While enabled + 30 days |
| `feed_items` | Dedupe key, GUID, posted message id, failure | feeds | 90 days |
| `member_role_snapshots` | Roles captured on leave for persistence | community | 90 days or until restore |
| `verification_challenges` | Local challenge, attempts, expiry | moderation | 24 hours |
| `ticket_kb_documents` | Guild-scoped KB docs and embeddings | community/AI | Until deleted |
| `analytics_daily` | Derived daily rollup, rebuildable | analytics | 400 days |
| `structure_snapshots` | Roles/channels/permissions snapshot | setup | 30 days |
| `calendar_links` | Google Calendar sync token (optional) | events | While linked |
| `notification_prefs` | Per-member reminder/DM preferences | community | While member |
| `ai_eval_runs` | Eval scores, model, cost, latency | AI | 90 days |
| `deletion_receipts` | What was deleted, when, by whom | setup | 365 days |

**Rules:** these are not second sources of truth. `analytics_daily` is a
rebuildable projection from the ledgers. `ticket_kb_documents` may reuse the
existing `ai_documents` table with a `kind` column; do not add a second vector
store. `structure_snapshots` stores the sanitized structure, never message
content.

### 8.2 Retention table

| Category | Default | Configurable | Notes |
| --- | --- | --- | --- |
| Guild settings | While installed | No | Exportable |
| Cases | 365 days | 30–730 | Exportable |
| Case events | 365 days | Follows case | Append-only |
| Tickets | Closed + 90 days | 30–365 | Transcripts opt-in |
| Ticket messages | Closed + 90 days | Follows ticket | Content-sensitive |
| Logging events | 30 days | 1–365 | Append-only |
| Command usage | 90 days | 30–365 | Aggregates only |
| Levels/XP events | Until reset | No | Seasonal archive |
| Economy ledger | 365 days | 180–730 | Append-only |
| AI documents | Until deleted | No | Guild-scoped |
| AI usage counters | 13 months | No | No prompts |
| Forms | Until deleted | No | Exportable |
| Events/RSVPs | Until deleted + 30 | No | Exportable |
| Modmail | Closed + 90 | 30–365 | Transcript opt-in |
| Feeds | While enabled + 30 | No | Dedupe 90 days |
| Role snapshots | 90 days | 7–180 | Opt-in |
| Verification challenges | 24 hours | No | Delete on use |
| Analytics rollups | 400 days | 30–400 | Rebuildable |
| Sessions | 7 days absolute | No | Idle 30 min |
| Idempotency keys | 24 hours | No | Replay window |
| Webhook deliveries | 30 days | No | Receipts |

### 8.3 Privacy classes

1. **Public configuration:** settings, templates, module flags.
2. **Member-identifying:** IDs, join/leave, levels, economy, cases.
3. **Content-sensitive:** message excerpts, ticket messages, transcripts, AI
   docs. Off by default where possible; retention bounded; export explicit.
4. **Secret:** tokens, session secrets, webhook secrets. Sealed, never exported,
   never logged.
5. **Derived:** analytics rollups, timelines, AI labels. Rebuildable; same
   access rules as their sources.

### 8.4 Migration strategy

- Additive migrations only; no destructive column drops in the same release.
- Backfill in a worker with a progress receipt.
- Dual-read for one release; dual-write only when necessary.
- Every migration has a rollback note and a test on PGlite.
- `pnpm db:migrate` stays explicit; never on boot.
- A migration that touches more than one module gets an ADR.

---

## 9. Architecture v3

### 9.1 Shape

Keep the modular monolith and the four-process split:

```text
apps/bot     gateway, adapter, composition, interaction routes
apps/worker  BullMQ consumer, timers, feeds, analytics, webhooks
apps/web     dashboard, API, OAuth, sessions, support console
apps/docs    static docs site (P10)
packages/*   kernel, ui, db, cache, queue, telemetry, config, testing, i18n
modules/*    one folder per module, kernel-only imports
```

No microservices. No Kubernetes requirement. No marketplace runtime.

### 9.2 Sharding

- Shard at 2,500 guilds; `SHARD_COUNT` explicit; never hardcode.
- Use discord.js `ShardingManager` or a small supervisor; one process per shard.
- Shard 0 owns DM/entitlement caveats; queue jobs carry `shard` or resolve it.
- Per-shard metrics: guilds, latency, reconnects, errors, memory.
- A shard restart must not duplicate a timer; idempotency keys are global.
- `pnpm shard:doctor` checks count, identify budget and queue placement.

### 9.3 Queue topology

| Job | Producer | Idempotency key | Retry |
| --- | --- | --- | --- |
| `moderation.expire` | `/mod ban`, `/mod temp-role` | case id | 3, backoff |
| `content.deliver` | reminders, schedules | record id | 3, backoff |
| `feed.poll` | cron per feed | feed id + interval | 3, jitter |
| `analytics.rollup` | daily cron | guild + day | 2 |
| `webhook.deliver` | settings/token events | delivery id | 3 |
| `backup.snapshot` | dashboard/command | guild + day | 2 |
| `ai.embed` | KB add/update | doc id + version | 2 |
| `structure.restore` | `/export structure` | snapshot id | 1 (manual retry) |

One dead-letter queue; a dashboard page to inspect and retry; a receipt row per
completed job. At-least-once is fine; duplicates are refused by the key.

### 9.4 Cache

- Redis for cooldowns, short-lived settings cache, feed locks and rate limits.
- In-memory fallback for local mode, with a logged warning.
- Settings cache version per guild; dashboard writes invalidate through a
  pub/sub channel or a short TTL (choose the simpler one; document it).
- No cache of message content; no cache of secrets.

### 9.5 Web

- Keep the framework-free Node HTTP app for the settings and API surfaces.
- Add a small progressive-enhancement layer (server-rendered HTML + HTMX or
  vanilla JS) for partial updates; no SPA build step required.
- Accessibility: WCAG 2.2 AA, keyboard navigation, focus states, contrast,
  reduced motion, screen-reader labels.
- Mobile: 360px layout, sticky nav, large touch targets.
- Charts: server-rendered SVG, no chart dependency.
- A support console for tickets, not just settings.
- A docs site separate from the app (Astro Starlight or equivalent).
- A Next.js shell remains optional and is **not built** in this plan; do not
  make it a dependency.

### 9.6 AI

- Provider port: OpenAI-compatible, Ollama default, BYO.
- Embeddings: exact cosine for small guilds; pgvector for large; a single
  `VectorIndex` port with two adapters.
- Context: guild-scoped only; no cross-guild retrieval.
- Citations: document title, chunk id, score, excerpt.
- Guardrails: prompt-injection tests, tool allowlist, output redaction, no
  destructive tools.
- Budget: dollar + request caps checked before the call; usage counters only.
- Eval: golden set, precision/recall, hallucination rate, cost/latency; a gate
  for enabling deflection by default.
- Planner: propose a schema-validated settings diff; preview; apply only on
  approval; never write autonomously.

### 9.7 Observability

- OpenTelemetry traces across command → service → DB → queue.
- Metrics: interaction latency, error rate, queue depth, job failures, shard
  reconnects, DB pool, cache hit rate, AI cost.
- Logs: structured, redacted, no secrets or message content by default.
- A status page backed by `/healthz`, `/readyz` and synthetic checks.
- A weekly ops report generated from the metrics.

### 9.8 Performance budgets

| Path | Target |
| --- | --- |
| Interaction ack | p95 < 1s |
| Handler excluding IO | p95 < 250ms |
| Dashboard server render | p95 < 300ms |
| Analytics query (90 days) | p95 < 500ms |
| Feed poll | < 5 minutes after source update |
| Queue job start | p95 < 2s |
| Memory per process at 1k guilds | < 512 MB |
| DB query | p95 < 50ms |

### 9.9 Testing strategy

- Unit tests for services and parsers.
- PGlite integration tests for stores and migrations.
- Contract tests for ports and fake adapters.
- Structural interaction tests through the real adapter and registry.
- Property tests for import/export, checksums, component ids and economy math.
- Fuzz tests for untrusted bundles, component payloads and link/profanity rules.
- Load tests for 2,500 guilds.
- A live probe that exercises SQL/Redis/queue/web/interactions with no token.
- A human live checklist for gateway-only paths.

---

## 10. Phases

### 10.1 P7.5 — Truth and live closure (2 weeks)

**Why now:** the memory audit found drift, the live proof is thinner than the
claim, and the P7 tail blocks the support-depth phase.

**Scope:**

1. Memory gate portability and the P0/P1 drift fixes.
2. Live proof: OAuth round trip, human slash, right-click, modal submit, member
   join, member leave; record each with a check id.
3. i18n completion: every reply, guard, economy reason and option description;
   a coverage test that fails on a new English-only command.
4. Role persistence: snapshot on leave, restore on rejoin, opt-in, audit.
5. Case export JSON/CSV and a false-positive report button.
6. Event RSVP buttons, scheduled reminders and ICS.
7. Forms modal input and forms in the guild bundle.
8. A `liveScope`/`partial` schema proposal, implemented in the same pass as the
   checks.

**Exit demo:** a moderator bans, appeals, reviews and exports a case; a member
leaves and rejoins and gets roles back; an event button RSVPs and an ICS file
downloads; a form modal submits; every reply is German; the gate is green on
Windows and Linux.

**Kill signal:** if live OAuth cannot be completed, ship the read-only dashboard
and mark the blocker; if role persistence cannot be made safe, keep it opt-in and
say so.

### 10.2 P8 — Support and community depth (4 weeks)

**Why:** this is where the remaining specialist invoices are. Ticket Tool,
MonitoRSS/Streamcord, Helper.gg and the event/forms/feed specialists are the
next bots an admin should be able to uninstall.

**Scope:** KB and AI deflection with citations; canned responses; intake forms;
transcript search; feedback; SLA dashboard; feeds and `/feed`; modmail relay,
attachments and search; analytics rollups, SVG charts and CSV; structure
snapshots and export v2; welcome images; role persistence UI; dashboard support
console; AI config planner; eval harness.

**Exit demo:** a guild replaces four bots; a ticket is answered from the KB with
a citation, handed off, transcribed and rated; a feed posts once; a structure
snapshot restores into a clean guild; the dashboard shows 90-day charts.

**Kill signal:** if deflection precision is below the eval threshold, ship
retrieval-only handoff; if a feed API requires a paid tier, use RSS only; if
structure restore is risky, keep dry-run only.

### 10.3 P9 — Music and voice (3 weeks, parallel)

**Why:** music is the last major specialist category, but it must not block
launch. It is optional and BYO.

**Scope:** Lavalink v4 adapter, DAVE, queue/playlists, DJ role, filters, node
health, legal page, fake-node contract tests, a local live node check.

**Exit demo:** an operator starts a local Lavalink v4 node; `/music play` works;
queue buttons, skip and stop work; a node failure refuses with the exact reason.

**Kill signal:** no legal source path → keep the queue-only module; DAVE
incompatibility → pin a supported Lavalink version and document it.

### 10.4 P10 — Launch (4 weeks)

**Why:** a v1.0 a stranger can run and learn from.

**Scope:** docs site, twenty lessons, API reference, SDK example, one-command
installer, Docker images, releases, changelog, status page, privacy/ToS, App
Directory/top.gg/discord.bots.gg listings, demo server, comparison and migration
content, launch checklist.

**Exit demo:** clean VM, one command, bot online, dashboard up, `/setup doctor`
green; a stranger ships a module in an afternoon; docs build with zero warnings.

**Kill signal:** listing rejected → launch self-host only; docs build broken →
fix before launch; no demo → no launch.

### 10.5 P11 — Scale and reliability (5 weeks)

**Why:** survive 2,500+ guilds and a real incident.

**Scope:** sharding, load tests, SLOs, alerts, incident drills, cost model,
backup/restore/deletion drills, security review, dependency policy, discord.js
v15 migration, channel-obfuscation regression, pgvector ANN benchmark.

**Exit demo:** a simulated 2,500-guild load at target p95; shard failover; a
restore drill; an incident drill inside 30 minutes.

**Kill signal:** load test fails → cap hosted guilds and document; sharding
destabilises → stay single-shard with a queue and publish the limit.

### 10.6 P12 — Category leadership (ongoing)

**Why:** turn parity into a lead.

**Scope:** AI eval and triage, config planner, ten languages/RTL, SDK, PWA,
Google Calendar, captcha providers, Activities, advanced analytics, public
roadmap, community translations, quarterly competitive scorecard.

**Exit demo:** quarterly scorecard; three capabilities no surveyed competitor
has; a community translation PR merged; an SDK example published.

### 10.7 Label mapping

Roadmap v3 inserts P7.5 and P8 and shifts the old labels:

| Old | New |
| --- | --- |
| P8 Music | P9 Music |
| P9 Launch | P10 Launch |
| P10 Hardening | P11 Scale |
| — | P7.5 Truth |
| — | P8 Support depth |
| — | P12 Leadership |

[[Roadmap]] v2 remains the historical index until this plan is accepted; the
mapping is recorded here so a reader is never confused by two P8s.

### 10.8 Effort and dependencies

| Phase | Effort (person-weeks) | Depends on | Can run parallel with |
| --- | ---: | --- | --- |
| P7.5 | 2 | Live credentials, human client | — |
| P8 | 4 | P7.5 schema, feed APIs, KB eval | P9 |
| P9 | 3 | Local Lavalink, voice test | P8 |
| P10 | 4 | P8 exit, docs content, listings | P11 prep |
| P11 | 5 | Load environment, SLOs | P10 docs |
| P12 | ongoing | P10 launch | — |

Calendar time is longer than effort because review, live proof and community
translation are serial. Plan for sixteen weeks to a public v1.0, not ten.

---

## 11. Launch and distribution

### 11.1 Positioning

- **Category:** the open-source, teach-by-default all-in-one bot with an exit
  guarantee.
- **One-liner:** "The last Discord bot you install — and the only one you can
  leave with everything."
- **Proof points:** free core, export/import/rollback, evidence and appeals,
  API/webhooks at every tier, self-host in one command, 631 token-free tests.

### 11.2 Channels

| Channel | Asset | Success signal |
| --- | --- | --- |
| GitHub | README, docs, issues, good-first-issues | Stars, contributors, PRs |
| App Directory | Listing, verification, screenshots | Installs |
| top.gg / discord.bots.gg | Listing, tags, demo | Votes, clicks |
| Docs site | Guides, API reference, lessons | Organic search, time on page |
| Demo server | Live bot, guided tour | Conversion to install |
| Reddit / self-hosted communities | Evidence-led posts, no spam | Qualified traffic |
| Hacker News / open-source | "Show HN" once, with a real demo | Feedback, contributors |
| YouTube/streamers | Short demos, not paid promos | Referrals |

### 11.3 Content that wins

1. "How to leave MEE6 without losing XP" — a real importer and a checklist.
2. "MEE6 vs Keystone: the bill, the data and the exit" — a cost calculator.
3. "Why your audit log should not expire when you stop paying."
4. "AI that cites, caps and forgets."
5. "One command, no paid dependency: self-hosting Keystone."
6. "How we test a Discord bot without a token."
7. "What we rejected: the marketplace, the streamer and the AI autoban."

Every claim links to code, a test or a live check. No ❔ competitor cell is used
in marketing.

### 11.4 Community

- A support server with a triage queue and a weekly office hour.
- A public roadmap with votes (dogfood `/tools suggest`).
- Good-first-issues and a contributor ladder.
- DCO, no CLA; a governance page with a maintainer succession rule.
- Monthly "state of the bot" post with metrics and incidents.
- Translation guild with a typed catalog and a coverage test.

### 11.5 Pricing posture

- Free core, forever, on every server.
- Hosted convenience (managed uptime, backups, AI credits at cost, custom
  identity) outside the repo; no feature is hosted-only.
- Donations/sponsorships for the project; no paid GitHub features.
- A public page that explains what hosting costs and what is free.
- A test that fails if a module manifest sets `premium: true`.

### 11.6 Launch checklist

- [ ] `pnpm check` green on Linux and Windows.
- [ ] `pnpm probe:live` 28/28 (or the new count) on a clean database.
- [ ] Human slash, right-click, modal, join and leave proofs recorded.
- [ ] Live OAuth round trip recorded, or the read-only limitation stated.
- [ ] Export/import/rollback drill on a 5,000-row guild.
- [ ] Docs build zero warnings; link checker green.
- [ ] Privacy policy, ToS, retention table and deletion receipt page.
- [ ] Security policy, threat model, incident runbook.
- [ ] App Directory/top.gg/discord.bots.gg listings.
- [ ] Demo server and a five-minute tour.
- [ ] One-command installer tested on a clean VM.
- [ ] Release notes and changelog.
- [ ] Support server and triage rota.
- [ ] Backup/restore/deletion drills.
- [ ] Load test at target scale.
- [ ] Cost model per 1,000 guilds.
- [ ] No secrets in the repo; secret scanning green.
- [ ] Licence, DCO and governance files.
- [ ] Accessibility pass on the dashboard.
- [ ] Translation coverage for the shipped surfaces.

---

## 12. Quality, security and compliance

### 12.1 Test strategy

| Layer | What it proves | Runs in `pnpm check` |
| --- | --- | --- |
| Unit | Parsers, services, rules | Yes |
| PGlite integration | Stores, migrations, transactions | Yes |
| Contract | Ports and fakes agree | Yes |
| Structural interaction | Real adapter → registry → dispatch | Yes |
| Property/fuzz | Import/export, ids, economy, untrusted input | Yes |
| Memory | Prose, links, counts, lessons | Yes |
| Live probe | SQL, Redis, queue, web, interactions | No (manual, token-free) |
| Human checklist | Gateway-only paths | No (manual) |
| Load | 2,500 guilds | No (manual) |

### 12.2 Threat model

| Threat | Mitigation |
| --- | --- |
| Token leak | Secret scanning, rotation runbook, minimal scopes, no logs |
| Permission escalation | Permission precheck, role hierarchy check, audit |
| Component forgery | Signed, expiring ids; guild/permission checks |
| Webhook forgery/replay | HMAC `t/v1`, timestamp tolerance, idempotency |
| SSRF | Allowlist schemes/hosts, no arbitrary fetch |
| CSRF/XSS/IDOR | CSRF tokens, CSP, output encoding, per-guild authz |
| SQL injection | Parameterised queries, Drizzle |
| Rate-limit ban | Invalid-request circuit breaker, backoff |
| Data exfiltration via AI | Guild-scoped retrieval, prompt-injection tests, no tools |
| Supply chain | Lockfile, pinned versions, audit, SBOM, signed releases |
| Abuse of imports | Size caps, schema validation, dry-run, receipts |

### 12.3 Privacy and compliance

- GDPR-style access/export/delete for member data.
- Retention table published and enforced.
- Data processing page; no subprocessors by default; AI provider optional.
- No IP/device collection in the default verification path.
- No message content stored unless a feature requires it, and then opt-in.
- A deletion receipt that names what was deleted and what could not be.
- A breach runbook with notification steps.

### 12.4 Discord policy

- Minimal intents; every privileged intent justified.
- No self-bots, scraping, mass DM or NSFW.
- Music is BYO and legal; the repo contains no streamer.
- Monetisation follows Discord Premium Apps rules; free core avoids the issue.
- App verification before 100+ guilds; directory assets prepared.
- Channel obfuscation handled through `resolveChannel()`.

### 12.5 Supply chain

- `pnpm audit` in CI (free).
- Dependabot/CodeQL for the public repo (free for public repos).
- A `SECURITY.md` disclosure path.
- Signed release tags and checksums.
- SBOM generation.
- No dependency added without a licence and maintenance check.

---

## 13. Teaching and documentation

### 13.1 Twenty lessons

The current curriculum has fourteen lessons. Add six:

1. The record: designing a member timeline.
2. Portability: export, checksum, restore, rollback.
3. Explainable moderation: evidence, appeals, false positives.
4. AI with receipts: RAG, citations, caps, eval.
5. Operations: sharding, SLOs, incidents.
6. Launch: docs, listings, support, governance.

Each lesson has a runnable proof, an exercise and a "what we rejected" section.

### 13.2 Module generator

`pnpm module:new <id>` scaffolds:

- `modules/<id>/src/index.ts` with `defineModule`
- spec, status and teaching pages
- a test file and a fixture
- a command root or a subcommand slot
- a settings schema
- an evidence entry in `features.json`

It refuses to overwrite, prints the budget impact and runs the focused checks.

### 13.3 Docs site

- Astro Starlight or equivalent, free and static.
- Generated from the vault where possible; hand-written guides where not.
- API reference from OpenAPI; SDK examples tested.
- Search, versioning, link checker.
- Deploy to GitHub Pages (free for public repos).
- A "build a module" path and a "self-host" path.

### 13.4 Runbooks

- Token leak.
- Raid/nuke incident.
- Database outage.
- Queue backlog.
- AI provider outage/cost spike.
- Discord API outage.
- Restore/deletion drill.
- Release rollback.

### 13.5 Research program

- Monthly refresh of the three claims the current phase depends on.
- A parity matrix update when a competitor changes.
- A quarterly competitive scorecard.
- A "what changed in Discord" note after every developer changelog that affects
  commands, components, intents, voice or monetisation.

---

## 14. Metrics and scoreboard

### 14.1 North star

**Verified migrations that stay.** A guild that exports from another bot,
imports into Keystone, and is still active after 30 days. It measures the wedge,
not vanity installs.

### 14.2 Supporting metrics

- Activation: guild completes `/setup doctor` + one module in ten minutes.
- Time to first value: first command/member action.
- Retention: 7/30/90-day active guilds.
- Bots uninstalled: survey and migration checklist.
- Export/import completion and failure rate.
- Support: first response, resolution, reopen rate.
- Reliability: p95 ack, handler, error rate, queue depth, shard reconnects.
- Cost per 1,000 guilds.
- AI: deflection rate, citation rate, cost per answer, eval score.
- Community: contributors, PR cycle time, translations, docs coverage.
- Trust: security incidents, data-loss incidents, deletion receipts issued.

### 14.3 Competitive scorecard

Update quarterly on five axes:

1. **Parity:** rows covered vs the five generalists.
2. **Depth:** specialist-grade features in leveling, tickets, security, music,
   analytics, feeds, events.
3. **Trust:** export, retention, appeals, AI citations, security posture.
4. **Operations:** API, webhooks, SLOs, status page, self-host.
5. **Experience:** setup, dashboard, docs, support.

Score each 1–5 with evidence. Publish it. A score without a source is a rumour.

### 14.4 Twelve-month targets

These are targets, not promises:

- One thousand self-hosted instances.
- Two thousand five hundred guilds on the reference host.
- Ninety-nine point nine percent monthly availability.
- Five thousand verified migrations.
- Fifty contributors and ten maintainers-in-training.
- Ten languages with typed catalogs.
- Nine hundred tests, all token-free.
- Forty live probe checks.
- A public security review and incident drill.

---

## 15. Risks and kill criteria

| Risk | Probability | Impact | Mitigation | Trigger |
| --- | --- | --- | --- | --- |
| Scope creep | High | High | Five tests, phase exit demos, kill signals | Two phases slip with no demo |
| One-maintainer burnout | High | High | Docs, generator, contributor ladder, DCO | No second maintainer by P10 |
| Discord platform change | Medium | High | Adapter, minimal intents, budgets, changelog watch | A limit invalidates a core module |
| Live OAuth blocked | Medium | Medium | Read-only dashboard, fake-port proof, documented blocker | P7.5 exit |
| AI cost/quality | Medium | High | Local-first, caps, eval, kill switch | Cost per guild or eval below gate |
| Security breach | Low | Critical | Threat model, reviews, secret scanning, least privilege | Any credible report |
| Data loss | Low | Critical | Dry-run, receipts, rollback, drills | Any failed restore |
| Music legal risk | Medium | High | BYO Lavalink, no bundled source, legal page | A rights holder objects |
| Feed API change | Medium | Medium | RSS fallback, adapters, backoff | A source requires payment |
| Dashboard UX lag | Medium | High | Server-rendered + progressive enhancement, mobile pass | Activation below target |
| Command payload cap | Medium | Medium | `/feed` root, payload CI, shorter copy | A root exceeds 7,800 chars |
| Sharding instability | Medium | High | Load tests, supervisor, rollback to single shard | Reconnect storms |
| Competitor bundling | High | Medium | Moats, not feature race; migration content | A generalist ships export |
| Free-tier abuse | Medium | Medium | Rate limits, caps, operator controls | Cost spike |
| Licence/governance conflict | Low | Medium | AGPL, DCO, public governance | A contributor objects |

### Assumptions to test

1. Admins will switch for portability, not only for price.
2. Self-hosters will accept Postgres/Redis if one command works.
3. AI deflection can meet the quality gate with a local model.
4. A dashboard can be delightful without a SPA framework.
5. The free core can be sustained by donations/hosting convenience.
6. A stranger can ship a module in an afternoon after the generator.

### Kill criteria

- If a phase's ten-minute demo cannot be shown, cut scope; never extend the date.
- If music cannot be legal, keep the queue and drop playback.
- If AI deflection misses the eval gate, keep retrieval-only handoff.
- If structure restore cannot be made safe, keep dry-run and export only.
- If sharding destabilises, stay single-shard with a documented cap.
- If the dashboard cannot pass authorization, ship read-only.
- If the project cannot find a second maintainer by P10, slow the roadmap and
  document the bus factor.

---

## 16. The next 90 days

### Days 1–14 — P7.5 truth and live closure

- Add `.gitattributes`, normalise, fix the memory gate.
- Fix the P0/P1 drift; add ADR-0019 to `project.json`.
- Record live OAuth, slash, right-click, modal, join and leave.
- Finish i18n; add the coverage test.
- Ship role persistence, case export, false-positive report.
- Ship event buttons, scheduled reminders, ICS.
- Ship forms modal and forms in the bundle.
- Propose `partial`/`liveScope` with the checks.

**Gate:** `pnpm check` green on Windows and Linux; the live checklist has no
unexplained gaps.

### Days 15–45 — P8 support depth

- KB, AI deflection with citations, canned responses, intake forms.
- Transcript search, feedback, SLA dashboard.
- Feeds and `/feed`; dedupe, backoff, failure notes.
- Modmail relay, attachments, search.
- Analytics rollups, SVG charts, CSV, cohorts.
- Structure snapshot, export v2, more importers.
- Welcome images, role persistence UI.
- Dashboard support console, mobile pass, onboarding checklist.
- AI config planner and eval harness.

**Gate:** a guild replaces four bots; the eval gate decides whether deflection is
on by default.

### Days 46–75 — P9 music and P10 launch prep

- Lavalink v4 adapter, DAVE, queue, DJ, filters, node health.
- Docs site, twenty lessons, API reference, SDK example.
- Installer, Docker images, releases, changelog.
- Privacy/ToS, retention page, security policy.
- Listings, demo server, comparison/migration content.
- Load-test harness and SLO drafts.

**Gate:** a clean VM runs the stack; the docs build is clean; music works with a
local node.

### Days 76–90 — P10 launch and P11 start

- Launch checklist, release notes, support rota.
- Public launch.
- Start sharding and load tests.
- Incident drill and backup/restore drill.
- First quarterly competitive scorecard.

**Gate:** a stranger self-hosts and ships a module; an incident drill completes;
the scorecard names three capabilities no surveyed competitor has.

### The first ten passes

| Pass | Title | Deliverable | Proof |
| --- | --- | --- | --- |
| 66 | Memory gate portability | `.gitattributes`, CRLF-safe check, P0/P1 drift | Gate green on Windows/Linux |
| 67 | Live proof | OAuth, slash, menu, modal, join, leave | Recorded check ids |
| 68 | i18n completion | All replies and guards in the catalog | Coverage test |
| 69 | Role persistence | Snapshot/restore, opt-in, audit | PGlite + adapter tests |
| 70 | Case export + false-positive | JSON/CSV, report button, precision | Round-trip + live probe |
| 71 | Event completion | Buttons, scheduled reminders, ICS | Queue + ICS tests |
| 72 | Forms modal + bundle | Modal input, bundle round-trip | Interaction test + export |
| 73 | Feed module | `/feed`, RSS/YouTube/Twitch, dedupe | Contract + live probe |
| 74 | Ticket KB + deflection | Docs, citations, handoff, eval | Eval gate + live probe |
| 75 | Modmail relay | DM/thread relay, search, attachments | Adapter + live probe |

### Roles

| Role | Owns | Veto question |
| --- | --- | --- |
| Maintainer | Architecture, roadmap, releases | Does this fit the record? |
| Platform | Adapter, budgets, sharding, queues | Which limit does it spend? |
| Trust & safety | Cases, dry-run, appeals, AI triage | Can it punish wrongly? |
| Data | Schema, retention, export/delete | Can it be exported and deleted? |
| UX | Panels, dashboard, onboarding | Does it fit 40 slots and 3 seconds? |
| Teaching | Specs, lessons, docs, generator | Can a beginner follow it? |
| Ops | SLOs, incidents, cost | How does it fail at 1,000 guilds? |
| Legal | Licence, music, privacy, Discord policy | Can we ship this free and legal? |

---

## 17. Appendices

### A. Competitor one-pagers

**MEE6.** The default. Best onboarding and level cards; the free tier is a demo;
moderation, automod, reaction roles and many leveling features are premium; AI is
a separate subscription; no export. Beat it on ownership and price, not on brand.

**Dyno.** The moderation workhorse. Broad automod, logs, autoroles, custom
commands, tickets and giveaways; no reaction roles; leveling paid; some premium
features need a second bot. Beat it on the union and the member record.

**Carl-bot.** Reaction roles and custom automation. 250 free reaction roles,
feeds, logs, embeds, triggers, suggestions, starboard; no leveling; log caps;
steep configuration. Beat it on leveling, tickets, AI and retention.

**ProBot.** Welcome images and presentation. 10.2M servers; $5/$10 premium tiers;
logs, automod, autoroles, invites, starboard; thinner leveling. Beat it on depth
and data ownership.

**Arcane / Lurkr / Tatsu.** Leveling and gamification. Lurkr is the no-paywall
leveling benchmark; Arcane has counters and social alerts; Tatsu has profiles,
economy and pets. Beat them with a free union and imports.

**Wick / Security Bot / Beemo / Double Counter.** Security. Wick is the
anti-nuke/anti-raid benchmark; Security Bot has a free captcha; Beemo is free
join-raid defense; Double Counter sells alt/VPN verification and suffered a
widely reported 2026 breach. Beat them with integration, transparency and
privacy-respecting verification.

**Ticket Tool / Helper.gg.** Support. Ticket Tool has 4.63M active servers and
435M tickets; Helper.gg adds a web panel and AI replies. Beat them with a unified
member record, free transcripts, KB citations and no per-resolution fee.

**Statbot.** Analytics. 670k+ communities; counters, charts, auto roles;
history/export paid; no actions. Beat it with source-counted analytics over the
same ledgers that run the bot.

**Apollo / Sesh.** Events. Calendars, RSVP, reminders, timezones; recurring and
waitlists premium. Beat them with integration into the community record and free
ICS.

**Jockie Music.** Music. Multi-source, multi-instance, stable; legal/source risk.
Beat it with BYO Lavalink, DAVE and no bundled streamer.

**MonitoRSS / Streamcord.** Feeds. RSS/Atom, Twitch/YouTube/Kick, dedupe. Beat
them with one module and a unified record.

**ModMail.** The open-source DM inbox. Beat it with a real suite and a dashboard,
not a second self-hosted service.

**Red-DiscordBot / YAGPDB / iHorizon.** Open-source prior art. Red proves cogs and
self-host; YAGPDB proves process split and feeds; iHorizon proves breadth and
locales. Beat them with a modern dashboard, tests, memory and one-command
self-host.

**PeakBot / YourBot / Helper.gg AI / Wallu / Relayn / Atis.** AI-native. They
prove setup speed and support deflection matter. Beat them with cited, capped,
zero-retention AI and a real record.

### B. Source log

| Source | Retrieved | Confidence | Used for |
| --- | --- | --- | --- |
| `https://mee6.xyz/en/premium` | 2026-11-03 | Low (JS-rendered) | Pricing shape; official page did not render |
| `https://wiki.mee6.xyz/premium` | 2026-11-03 | High | Per-server subscription; monthly/yearly/lifetime; no price |
| `https://dyno.gg/bot`, `https://dyno.gg/premium` | 2026-11-03 | Low (JS-rendered) | Feature shape; pricing from internal teardown |
| `https://carl.gg/`, `https://docs.carl.gg/` | 2026-11-03 | Low (JS-rendered) | Feature shape; pricing from internal teardown |
| `https://probot.io/pricing` | 2026-11-03 | High | $5/$10 monthly; $3.33/$6.67 yearly; 10.2M servers |
| `https://docs.tickettool.xyz/` | 2026-11-03 | High | 4.63M active servers; 435M tickets |
| `https://securitybot.gg/` | 2026-11-03 | Medium | $3.50 premium; captcha/anti-nuke |
| `https://wickbot.com/` | 2026-11-03 | Low | Feature shape; no public price table |
| `https://statbot.net/` | 2026-11-03 | High on claim | 670k+ communities; analytics/counters |
| `https://tatsu.gg/` | 2026-11-03 | High on claim | 1.35M servers; leveling/economy |
| `https://lurkr.gg/`, `https://lurkr.gg/premium` | 2026-11-03 | High | No-paywall leveling; import |
| `https://apollo.fyi/news/pricing-april-2026` | 2026-11-03 | High | $7.99/month or $69.99/year |
| `https://www.jockiemusic.com/` | 2026-11-03 | Medium | Music sources; multi-instance |
| `https://github.com/Cog-Creators/Red-DiscordBot` | 2026-11-03 | High | GPLv3; cogs; self-host |
| `https://yagpdb.xyz/` | 2026-11-03 | High | Feeds, role menus, automod, custom commands |
| `https://docs.modmail.dev/`, `https://github.com/chamburr/modmail` | 2026-11-03 | High | Self-hosted DM inbox |
| `https://monitorss.xyz/`, `https://streamcord.io/` | 2026-11-03 | High | Feeds, stream alerts |
| `https://giveawaybot.party/`, `https://suggestions.gg/` | 2026-11-03 | High | Giveaways, suggestions |
| `https://doublecounter.gg/`, `/features` | 2026-11-03 | High on features | Verification, alt/VPN detection; breach reports third-party |
| `https://wallubot.com/`, `https://relayn.io/`, `https://atisbot.com/`, `https://quickchat.ai/` | 2026-11-03 | Medium | AI support, KB, handoff, pricing |
| `https://peakbot.pro/blog/discord-bot-pricing-comparison-2026` | 2026-11-03 | Low (vendor marketing) | 2026 price comparison and AI-native framing |
| `https://yourbot.gg/blog/best-discord-bots-2026` | 2026-11-03 | Low (vendor marketing) | Market map; Dyno ticket module claim |
| `https://docs.discord.com/developers/application-commands` | 2026-11-03 | High | 100 commands, 15+15 menus, 8k payload |
| `https://docs.discord.com/developers/components/reference` | 2026-11-03 | High | 40 components, V2, modals |
| `https://docs.discord.com/developers/events/gateway` | 2026-11-03 | High | Sharding, 2,500/shard, rate limits |
| `https://docs.discord.com/developers/activities/building-an-activity` | 2026-11-03 | High | Activities are web apps |
| `https://lavalink.dev/changelog/v4.html` | 2026-11-03 | High | Lavalink v4; DAVE |
| `memory/machine/research.json` R-001–R-020 | 2026-10-31 | Medium–High | Platform, pricing, portability, open source |
| `memory/vault/02-Research/*` | 2026-10-31 | Medium | Internal teardowns, pain points, platform limits |

### C. Memory audit summary

See [[Memory-Audit-2026-11-03]]. The short version: the counts are honest, the
feature evidence is real, and the remaining defects are line-ending brittleness,
stale current-tense sentences, one missing ADR pointer, and a status vocabulary
that conflates "not live" with "not built".

### D. Glossary

- **Record:** the joined member/guild history across modules.
- **Moat:** a difference a competitor cannot copy in one release.
- **Live probe:** a token-free script that exercises SQL/Redis/queue/web.
- **Gateway proof:** a human-observed Discord interaction.
- **Exit guarantee:** export/import/rollback/receipt/drift.
- **Partial:** shipped in part; the open part is named.
- **Free core:** every shipped feature is free; hosting is convenience.

### E. Decisions needed

1. Accept Roadmap v3 and map the old P8/P9/P10 labels.
2. Approve `partial` and `liveScope` in the feature schema.
3. Choose the web progressive-enhancement layer (HTMX vs vanilla).
4. Choose the docs site (Astro Starlight vs equivalent).
5. Approve BYO Lavalink v4 as the only music path.
6. Approve local-first AI with optional hosted providers.
7. Approve the `/feed` root and the payload budget.
8. Approve the structure-snapshot scope (roles/channels/permissions; no
   messages).
9. Approve the ten-language target and the translation workflow.
10. Approve the hosted-convenience pricing boundary (no feature paywall).

---

> **The plan in one sentence:** finish the record, prove it live, make it fast
> and legible, give it an exit guarantee, and launch it to the people who are
> tired of paying four invoices for four half-bots.
