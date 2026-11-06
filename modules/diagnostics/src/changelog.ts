/**
 * The single source for the version and the latest pass.
 *
 * `/help changelog` used to hard-code "pass 26" long after pass 42, which made a
 * command whose description promised "the latest pass" the most obviously stale
 * surface in the bot. The memory gate now compares `CHANGELOG[0]` with the
 * highest pass in `memory/machine/passes.json`, so the next pass that forgets
 * to add an entry fails `pnpm check` instead of shipping a confident lie.
 *
 * Keep this file small: one entry per pass that changes what a user can see.
 * Internal refactors belong in the journal, not here.
 */
export const VERSION = "0.1.0";

export interface ChangelogEntry {
  /** The pass id exactly as it appears in `memory/machine/passes.json`. */
  pass: string;
  date: string;
  summary: string;
  /** The journal this entry points at, relative to the repository root. */
  journal: string;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    pass: "pass-84",
    date: "2026-11-06",
    summary:
      "The moderation case is one card instead of three embeds: `/mod case`, every action reply, history, the review queue, the case-history menu and both appeal subcommands now share one builder with a state accent, one facts line, the reason, a read-stamped footer and one action row — so the appeal button sits inside the record it belongs to. A notice can carry that card to the mod-log channel, and the dashboard's channel and role ids become pickers grouped by category with a text fallback when Discord cannot be read.",
    journal: "memory/journal/2026-11-06-pass-84.md",
  },
  {
    pass: "pass-83",
    date: "2026-11-06",
    summary:
      "Music plays: one Lavalink 4.2.2 node from compose owns voice and DAVE behind the existing playback port, the durable row is now the play queue (its head is the current track), and `/music` gains pause, resume, volume, loop, shuffle and jump over the same queue. One signed Components V2 card shows progress, the next tracks and a jump select; the dashboard starts and controls the same session through Redis and says `Last known state, not live` instead of showing a dead player. A restart resumes the queue from its head at 0:00, and the page says so.",
    journal: "memory/journal/2026-11-06-pass-83.md",
  },
  {
    pass: "pass-78",
    date: "2026-11-05",
    summary:
      "Dashboard product pass: one shell and palette on every page, a goal-grouped module catalog with an audited enable/disable toggle, four computed readiness facts with fix links, a guild activity page over the real audit rows, and a read-only channels-and-roles directory so settings ids no longer need Developer Mode. Analytics names its sources and off switches. The real Discord OAuth login, toggle and directory are proven in a browser on Postgres; token refresh/revocation remain probe-only.",
    journal: "memory/journal/2026-11-05-pass-78.md",
  },
  {
    pass: "pass-77",
    date: "2026-11-05",
    summary:
      "Visual mission: every visible surface now has a graded ledger row and a gate (`pnpm audit:visuals`) that fails on an unledgered panel, an unproven A, an inline accent hex or a missing footer. `packages/ui` gains the shared grammar — heading, facts, rows, empty state, footer and one action row — with state accents and one glyph set; `/mod history user:@member` is the first panel rebuilt on it, and its Refresh button now edits the panel in place instead of posting a second message.",
    journal: "memory/journal/2026-11-05-pass-77.md",
  },
  {
    pass: "pass-76",
    date: "2026-11-05",
    summary:
      "P7.5 member history: `/mod history user:@member` is now one Components V2 timeline across cases, tickets, levels, economy, invites, forms, events, modmail and the member row. Every row names its source table, a store that could not be read is named rather than shown as empty, and the last 12 rows plus an older-row count fit one screen.",
    journal: "memory/journal/2026-11-05-pass-76.md",
  },
  {
    pass: "pass-75",
    date: "2026-11-05",
    summary:
      "P7.5 front door: in a server, `/help` is a Components V2 hub with the modules that are on, the open ticket and case counts the caller may see, database and cache state, the live registry totals, and signed module, Overview, privacy and changelog controls. A DM keeps the flat command card.",
    journal: "memory/journal/2026-11-05-pass-75.md",
  },
  {
    pass: "pass-74",
    date: "2026-11-05",
    summary:
      "P7.5 portability: `/export guild` now carries every form and every submitted answer with its review decision, under the same version 2 snapshot, checksum and count rules as the other rows. A bundle from before this change is refused by version instead of restoring a server with no forms.",
    journal: "memory/journal/2026-11-05-pass-74.md",
  },
  {
    pass: "pass-73",
    date: "2026-11-05",
    summary:
      "P7.5 events: opening an event posts signed Going/Not going buttons, the existing 60-second tick sends one claimed reminder, and `/event export` also attaches an RFC 5545 calendar built from the same RSVP rows.",
    journal: "memory/journal/2026-11-05-pass-73.md",
  },
  {
    pass: "pass-72",
    date: "2026-11-05",
    summary:
      "P7.5 case export: `/mod case` and `/mod history` accept `format:json|csv` and attach the case with its events and a content checksum, without a new root, subcommand or table.",
    journal: "memory/journal/2026-11-05-pass-72.md",
  },
  {
    pass: "pass-71",
    date: "2026-11-05",
    summary:
      "P7.5 role persistence: `/tools roles persist:on` remembers a member's roles when they leave and restores them once when they rejoin, capped and with Discord as the final authority.",
    journal: "memory/journal/2026-11-05-pass-71.md",
  },
  {
    pass: "pass-70",
    date: "2026-11-05",
    summary:
      "Documentation pass: the Discord MCP proof surface (189 tools) is recorded with the interaction, join, DM, voice and file-upload limits it cannot cross. No command, reply or interaction changed.",
    journal: "memory/journal/2026-11-05-pass-70.md",
  },
  {
    pass: "pass-69",
    date: "2026-11-05",
    summary:
      "Truth pass: the feature matrix separates partial work from absent work, and every live claim now names either a probe check or a written record. No command, reply or interaction changed.",
    journal: "memory/journal/2026-11-05-pass-69.md",
  },
  {
    pass: "pass-68",
    date: "2026-11-05",
    summary:
      "Research pass: 18 competitors and an 18-row build-gap register are now machine truth, generated into the vault and cross-checked by the memory gate. No command, reply or interaction changed.",
    journal: "memory/journal/2026-11-05-pass-68.md",
  },
  {
    pass: "pass-67",
    date: "2026-11-05",
    summary:
      "Documentation pass: the README and AGENTS became a 244/148-line front door, with the pass history and live evidence linked instead of duplicated. No command, reply or interaction changed.",
    journal: "memory/journal/2026-11-05-pass-67.md",
  },
  {
    pass: "pass-66",
    date: "2026-11-03",
    summary:
      "Planning pass: a full memory audit and the proposed Roadmap v3. The audit fixes stale current-tense claims and the CRLF gate trap; no command, reply or interaction changed.",
    journal: "memory/journal/2026-11-03-pass-66.md",
  },
  {
    pass: "pass-65",
    date: "2026-11-03",
    summary:
      "Structure only: each module's component routes now sit beside that module's adapter and every module shares one signer contract. No command, reply or interaction changed.",
    journal: "memory/journal/2026-11-03-pass-65.md",
  },
  {
    pass: "pass-64",
    date: "2026-11-03",
    summary:
      "P7 interactions: the case appeal button and the DM verification button are signed, expiring ids on the shared router. A copied, forged, expired or cross-server press is refused before it can touch a case or a member row.",
    journal: "memory/journal/2026-11-03-pass-64.md",
  },
  {
    pass: "pass-63",
    date: "2026-11-03",
    summary:
      "P7 copy correction: an option's German description now follows its own subcommand, English command text lives only in the command definition, the daily refusal no longer mixes languages, and the changelog says why its entries stay English.",
    journal: "memory/journal/2026-11-03-pass-63.md",
  },
  {
    pass: "pass-62",
    date: "2026-11-03",
    summary:
      "P7 command copy: every registered root, subcommand and option description, plus the /ping, /about, /help, /rank and /ticket replies, comes from the typed catalog in German, and a coverage test fails when a command ships English-only.",
    journal: "memory/journal/2026-11-03-pass-62.md",
  },
  {
    pass: "pass-61",
    date: "2026-11-03",
    summary:
      "P7 interactions: role buttons, role select menus, giveaway entries, suggestion votes and polls now carry signed, expiring ids handled by the same shared router as the ticket panel. An old or copied panel is refused without a write.",
    journal: "memory/journal/2026-11-03-pass-61.md",
  },
  {
    pass: "pass-60",
    date: "2026-11-03",
    summary:
      "P7 community panels: the rank card and ticket panel are typed V2 surfaces, the ticket button is signed and guild-bound (an old or copied panel cannot open a ticket), and welcome/goodbye render their substituted text through the same layer.",
    journal: "memory/journal/2026-11-03-pass-60.md",
  },
  {
    pass: "pass-59",
    date: "2026-11-03",
    summary:
      "P7 i18n: panels, modal receipts and shared refusals render in the guild's setup.locale from one typed catalog, /config and the dashboard validate the same locale list, and Discord command descriptions are generated from the catalog instead of a hand-maintained table. A missing translation falls back to English, then to a plain sentence rather than a raw key.",
    journal: "memory/journal/2026-11-03-pass-59.md",
  },
  {
    pass: "pass-58",
    date: "2026-11-03",
    summary:
      "P7 Components V2: panels are now built through a typed layout that refuses to exceed Discord's 40-component or 4,000-character budget, buttons and modals carry signed expiring ids, and `/form panel` posts a real Apply button that opens a modal and files the same validated submission as the command path.",
    journal: "memory/journal/2026-11-03-pass-58.md",
  },
  {
    pass: "pass-57",
    date: "2026-11-03",
    summary:
      "P6 session lifecycle: a dashboard session unused for 30 minutes (configurable with WEB_SESSION_IDLE_MS) is ended and deleted, activity keeps it alive without extending the 7-day maximum, and an expired Discord access token is refreshed from a sealed, rotating refresh token — once even when two requests arrive together. Logout now revokes the refresh grant.",
    journal: "memory/journal/2026-11-03-pass-57.md",
  },
  {
    pass: "pass-56",
    date: "2026-11-03",
    summary:
      "P6 webhooks and Idempotency-Key: subscribe an https endpoint from the dashboard, receive HMAC-signed settings and token events, watch retries back off and stop on the delivery receipt page, and safely retry a keyed token write knowing the stored response will be replayed instead of applied twice.",
    journal: "memory/journal/2026-11-03-pass-56.md",
  },
  {
    pass: "pass-55",
    date: "2026-11-03",
    summary:
      "P6 scoped API tokens: issue a guild-bound keystone_… token with guild:read, analytics:read or settings:write, use it on the existing /api/v1 routes, and revoke it; the secret is shown once, only its hash is stored, every call is scope-checked and rate-limited, and the OpenAPI document is generated from the routes.",
    journal: "memory/journal/2026-11-03-pass-55.md",
  },
  {
    pass: "pass-54",
    date: "2026-11-03",
    summary:
      "P6 session hardening: dashboard sessions rotate their opaque cookie, logout revokes the Discord grant through the OAuth port, per-route limits return 429 with Retry-After, and WEB_OWNER_IDS gates an instance console that can end a user's sessions.",
    journal: "memory/journal/2026-11-03-pass-54.md",
  },
  {
    pass: "pass-53",
    date: "2026-11-03",
    summary:
      "P6 dashboard analytics: the dashboard and API show bounded aggregates over the audit, case, invite, ticket and command ledgers that already exist, with source row counts and an honest empty state.",
    journal: "memory/journal/2026-11-03-pass-53.md",
  },
  {
    pass: "pass-52",
    date: "2026-11-03",
    summary:
      "P6 saved templates: save a server's settings as a named template, then preview and apply it to the servers you manage through the same audited, schema-validated path; invalid or stale templates are refused.",
    journal: "memory/journal/2026-11-03-pass-52.md",
  },
  {
    pass: "pass-51",
    date: "2026-11-03",
    summary:
      "P6 config portability: download a checksummed settings bundle, import one behind a schema-validated preview and a stale-proof apply, and compare a stored baseline with live settings to see drift.",
    journal: "memory/journal/2026-11-03-pass-51.md",
  },
  {
    pass: "pass-50",
    date: "2026-11-03",
    summary:
      "P6 fleet view: three built-in templates preview a schema-validated diff across the servers you manage, and apply only the previewed plan through the audited settings path.",
    journal: "memory/journal/2026-11-03-pass-50.md",
  },
  {
    pass: "pass-49",
    date: "2026-11-02",
    summary:
      "P6 settings widgets: the dashboard form is generated from each module's Zod schema, and every accepted settings change is written to the audit trail with its actor and diff.",
    journal: "memory/journal/2026-11-02-pass-49.md",
  },
  {
    pass: "pass-48",
    date: "2026-11-02",
    summary:
      "Truth gate: current-tense counts and capability claims now fail the build when they disagree with the machine files; root governance and issue/PR templates added.",
    journal: "memory/journal/2026-11-02-pass-48.md",
  },
  {
    pass: "pass-47",
    date: "2026-11-02",
    summary:
      "Teaching pass: 14 lessons taught against the real code, a memory gate that checks their commands and counts, and a Docker quickstart that matches the web guard.",
    journal: "memory/journal/2026-11-02-pass-47.md",
  },
  {
    pass: "pass-46",
    date: "2026-11-02",
    summary:
      "Panic mode snapshots and restores every changed @everyone overwrite, and goodbye messages reuse the welcome settings without a role or DM branch.",
    journal: "memory/journal/2026-11-02-pass-46.md",
  },
  {
    pass: "pass-45",
    date: "2026-11-02",
    summary:
      "Temporary moderation and scheduled delivery: one delayed timer queue, one atomic expiry claim, and startup recovery on real case/community rows.",
    journal: "memory/journal/2026-11-02-pass-45.md",
  },
  {
    pass: "pass-44",
    date: "2026-11-02",
    summary:
      "Live substrate: compose Postgres/Redis, 13 migrations, a transaction-safe migrator and 9/9 SQL, Redis, queue and web checks.",
    journal: "memory/journal/2026-11-02-pass-44.md",
  },
  {
    pass: "pass-43",
    date: "2026-11-02",
    summary:
      "Truth pass: documented counts, paths and capability claims are checked against the code, and `/help changelog` follows the pass ledger.",
    journal: "memory/journal/2026-11-02-pass-43.md",
  },
  {
    pass: "pass-42",
    date: "2026-11-01",
    summary:
      "Modmail: private owner-or-staff threads, a first-staff-reply claim and a transcript archived once.",
    journal: "memory/journal/2026-11-01-pass-42.md",
  },
  {
    pass: "pass-41",
    date: "2026-11-01",
    summary:
      "Events: a draft/open/closed lifecycle, one RSVP row per member, capacity inside the transaction and a checksummed export.",
    journal: "memory/journal/2026-11-01-pass-41.md",
  },
] as const;

/** The newest entry. `audit:claims` proves it matches the pass ledger. */
export const LATEST_PASS = CHANGELOG[0]?.pass ?? "";
