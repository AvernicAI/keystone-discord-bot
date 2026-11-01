# Moderation & security — spec

Moderation replaces the manual moderation of **Dyno and Carl-bot** and the
security layer of **Wick**. Tickets remain P3, but every punitive action here
creates the same case file tickets and AI will later reference.

The defining promise is not "more punishments". It is **accountability**:
a scripted raid is contained, and every action has a case number, a written
reason, evidence and an appeal path. The default is dry-run.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/mod` | `action` (ban, kick, timeout, warn, purge, lock, unlock, slowmode, case, note, history, links, review), `user`, `reason`, `case`, `duration`, `limit`, `channel`, `dry_run` | guild-only, `ModerateMembers` | Executes one manual action or reads the case/review queue. `links` lists the newest link-filter findings; `review` closes the loop. Every enforced action opens a case before the external call. |
| `/appeal` | `case` (required), `message` | guild-only | Opens an appeal for the target's own case. Adds an `appealed` event; never edits history or reverses automatically. |
| `/verify` | none | guild-only | Completes the join gate by removing the quarantine role. A command fallback for the verification button. |

`/mod` is a hub: those thirteen actions cost **one** global command. The module
spends 3 of Discord's 100.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Module switch |
| `dryRun` | **`true`** | Observe and alert; no delete, timeout, quarantine, kick or ban |
| `modLogChannelId` | unset | Where case alerts and appeal/verify buttons are posted |
| `quarantineRoleId` | unset | Role applied by quarantine; falls back to a role named `Quarantined` |
| `appealsEnabled` | `true` | Whether `/appeal` and the appeal button work |
| `antiRaid.joinsPerWindow` | `10` | Joins inside `windowMs` that trigger raid mode |
| `antiRaid.windowMs` | `60000` | Join/heat window |
| `antiRaid.raidMinutes` | `5` | How long later joins stay quarantined |
| `antiRaid.minAccountAgeDays` | `7` | Age threshold used in evidence/join gate |
| `antiRaid.quarantine` | `true` | Retrospectively quarantine the burst |
| `antiNuke.actionsPerWindow` | `3` | Role/channel deletion actions before an alert/quarantine |
| `antiNuke.windowMs` | `60000` | Anti-nuke audit window |
| `antiNuke.webhookThreshold` | `1` | A created webhook is treated as hostile |
| `antiNuke.quarantineActor` | `true` | Hold the audit-log actor |
| `automod.invites` | `delete` | `off`, `alert`, `delete` or `timeout` after repeated posts |
| `automod.links` | `off` | `off`, `alert` or `delete` for a blocklisted or punycode host |
| `automod.linkBlocklist` | `[]` | Up to 200 host entries; an entry also covers its subdomains |
| `automod.maxMentions` | `8` | Mention spam threshold |
| `automod.duplicateWindowMs` | `30000` | Duplicate hash window |
| `automod.duplicateThreshold` | `3` | Repeats before a duplicate action |
| `joinGate.enabled` | `false` | Hold new accounts until verification |
| `joinGate.minAccountAgeDays` | `7` | Join-gate age threshold |
| `joinGate.timeoutMinutes` | `10` | Intended review window (the expiry job is not wired yet) |
| `nativeAutoMod.sync` | `false` | Manage prefixed Discord AutoMod rules |

## Events and decisions

| Event | Rule | Default decision |
| --- | --- | --- |
| `member.join` | `anti-raid.join-burst` | Alert; quarantine every join in the window |
| `member.join` | `join-gate.account-age` | Quarantine a young account when the gate is enabled |
| `message.create` | `automod.invite` / `automod.invite-burst` | Delete; optional timeout after repeated posts |
| `message.create` | `automod.link` | Alert or delete; a blocklisted host or a punycode label |
| `message.create` | `automod.mention-spam` | Delete |
| `message.create` | `automod.duplicate` | Delete |
| `audit.action` (role/channel delete) | `anti-nuke.mass-action` | Alert; quarantine the actor at the threshold |
| `webhook.create` | `anti-nuke.webhook` | Delete webhook; alert; quarantine the creator |

The engine keeps only short-lived heat in memory. The case file is durable; the
heat is not. A restart resets raid heat, which is why the case remains the
source of truth.

## Case model

- `cases` stores one record per action: guild, monotonic case number, actor,
  target, action, reason, rule, state and JSON evidence.
- `case_events` is append-only: `created`, `note`, `reviewed`, `appealed`.
- `case_counters` allocates the next number atomically per guild. A unique index
  on `(guild_id, case_number)` is the backstop.
- Evidence contains the trigger detail, not the whole message. Invite content is
  truncated to 500 characters; no general message archive is created.

## Link filter

`suspiciousLink` is a pure function over message content and the local blocklist.
It extracts `http(s)` URLs, normalises the host (lowercase, `www.` and a trailing
dot removed), and reports the first suspicious host with
`evidence: { host, match }`:

- **blocklist** — the host equals an entry or ends in `.` plus an entry. This is
  equality, not a substring, so `notphish.test` cannot match `phish.test`.
- **punycode** — any label starts with `xn--`. This is heuristic: it can hide a
  lookalike domain, and it is also how a legitimate internationalised domain is
  encoded. An allow-list is not built yet.

The filter is **off** by default. `alert` creates an `alerted` case and leaves
Discord's message alone; `delete` uses the same `delete-message` coordinator path
as the invite filter. The full message is not stored, only the host and the
match kind. `/mod links` reads the newest 25 cases with rule `automod.link`, so
the review queue stays the single place a moderator closes a finding.

In development, a bot-authored message in `DEV_GUILD_ID` that starts with
`keystone-test:` is evaluated as member content after the marker is stripped.
It exists so the Discord MCP can drive the real gateway → coordinator path with
one account. It is not registered in production.

## Native AutoMod

`buildNativeAutoModPlan` produces keyword (invite) and mention-spam rules only
when `nativeAutoMod.sync` is true. The adapter deletes only rules whose names
start with `Keystone ·`, so a server's own rules survive. The plan is tested;
the live Discord sync is not, because no gateway token is available here.

## Intents and permissions

Intents: `GuildMembers`, `GuildMessages`, `MessageContent`, `GuildModeration`,
`AutoModerationExecution`. `GuildMembers` and `MessageContent` are privileged;
without them anti-raid and content scanning degrade, and `/setup` should say so
in P3.

Bot permissions: `ModerateMembers`, `BanMembers`, `KickMembers`,
`ManageMessages`, `ManageChannels`, `ManageRoles`, plus `ManageWebhooks` and
`ManageGuild` used by the action/AutoMod adapters. Every action checks the
permission **before** the Discord call.

## Non-goals

- AI classification and autonomous punishment. P4 may recommend; it never acts.
- DM appeals and a web appeal form. P2 uses the guild command and case button.
- Backups. P5 restores structure; this module records actions.
- Storing message content by default. Only the triggering evidence slice is kept.
- A remote threat-intelligence feed or a maintained phishing database. The list
  is local, operator-owned settings data; no network dependency or paid service.

## Verified by

- `modules/moderation/src/security.test.ts` — scripted raid, dry-run, link
  filter (off, blocklist subdomain, punycode, ordinary link), native plan.
- `modules/moderation/src/mod.test.ts` — registry, permission guard, enforced
  action, zero-write dry-run, reason requirement, appeal ownership, verification,
  `/mod links` read path.
- `apps/bot/src/moderation-events.test.ts` — the dev marker is guild-scoped and
  stripped; ordinary member messages still reach the coordinator.
- `packages/db/src/cases.test.ts` — PGlite case numbering, events, state and
  concurrent allocation.
- `pnpm budget` — 6/100 with all P2 commands.
