# Portability architecture

> A server's data is the server's. This page is the design; the operator steps
> are [[Portability-Runbook]], and the evidence is [[01-Mission/Feature-Status]].

## The promise, precisely

**Export everything we store. Restore it exactly. Import where the source gives
you a file. Guide the rest.** We do not claim one-click migration from Dyno,
Carl-bot or Wick because those vendors expose no usable egress. A broken
one-click promise is worse than an honest checklist.

## Two surfaces, one service

The CLI (`pnpm portability ...`) and `/export guild | user | import | delete |
drift | rollback` call the same `PortabilityService` in SQL mode. The command
formats results; it does not own bundle or restore policy. The SQL adapter
constructs the service over `createPortabilityStore`, and the memory adapter
exports the live in-memory stores while refusing import, delete and rollback
with the exact missing prerequisite (`DATABASE_URL`). See [[03-Architecture/ADR/ADR-0015-portability-bundles-and-receipts|ADR-0015]]
for why the service, not a second implementation, sits behind both doors.

## The bundle

One JSON file, format `keystone.export`, version `1`, capped at **25 MB**.

| Part | What it carries |
| --- | --- |
| `manifest` | format, version, generator, `createdAt`, source guild, SHA-256 checksum, row and unique counts, what is included and omitted |
| `snapshot.guild` | id, name, locale, plan, join/leave timestamps |
| `snapshot.settings` | every `(module, key, value)` row |
| `snapshot.cases` / `caseEvents` | moderation accountability and its append-only history |
| `snapshot.tickets` | ticket metadata; transcripts stay user-owned archives |
| `snapshot.levels` / `xpEvents` | XP projection and the events that produced it |
| `snapshot.economyLedger` | every money movement |
| `snapshot.auditEvents` | action log |
| `snapshot.communityRecords` | panels, giveaways, tags, feeds, transcript references |
| `snapshot.aiDocuments` / `aiUsage` | server docs and aggregate counters — never prompts or completions |

The checksum is SHA-256 over **canonical JSON** (object keys sorted, array order
preserved). It is computed and checked before the first write, so an edited or
truncated file is refused. Counts are checked too: a manifest that says 5,000
levels and a file with 4,999 is corrupt.

### Why JSON, not NDJSON

NDJSON streams better and is the right format at 500k members. At the current
scale, a single JSON document is one download, one checksum and one file a
beginner can open. The 25 MB cap is the honest boundary; a future version can add
NDJSON without changing the manifest contract.

## Restore

1. Parse, verify version, checksum, guild identity and counts.
2. Snapshot the destination guild as a **pre-import backup**.
3. Diff the destination against the incoming snapshot and return the receipt if
   this is a dry run.
4. Replace every guild-scoped row in **one Postgres transaction**: cases cascade
   to case events; inserts are chunked to stay under the parameter ceiling.
5. Read the destination again and compare checksums. The result is stored as
   `verified: true|false`; a mismatch is a loud warning, never a silent success.
6. Write an `imports` receipt with counts, diff, backup id and actor.

A failed insert rolls the transaction back. The service still writes a `failed`
receipt so the operator can see what was attempted; the old data is intact.

### Merge is deliberately narrow

`replace` is full fidelity. `merge` imports **settings and levels only**:

- settings are upserted by `(module, key)`;
- levels use `replace`, `keep-higher` or `add-on-top`;
- cases, tickets, ledger entries and audit events stay as they are.

Concatenating two guilds' history would create duplicate case numbers, money
with no shared provenance and a receipt that looks successful while lying. A
narrow merge with a named limitation is the honest shape.

### Rollback

The pre-import snapshot is stored in `backups` and can be restored for **24
hours**. Rollback requires an `applied` import, a backup id and a backup inside
the window. It writes the old snapshot back through the same transactional
replace and marks the import `rolled-back`. There is no "undo an undo"; restore a
bundle if you need to move forward again.

## Deletion

`deleteGuild` removes every guild-scoped row, **including backups**, in one
transaction. It then writes an `imports` receipt with `source: deletion`, row
counts, a content hash and the actor. The receipt does not contain the deleted
content; it is proof of what was removed, not a hidden copy.

## Level imports

File importers parse a saved export, never a vendor dashboard:

- MEE6 leaderboard JSON (`players[]`);
- generic JSON arrays or `levels`/`users`/`members`/`data`/`leaderboard` arrays;
- generic CSV/TSV with common `user_id`/`userId` and `xp`/`experience` names;
- Lurkr, Polaris, Arcane and XP Bot files through the same header mapper.

Ids must be Discord snowflakes (15–22 digits); duplicates keep the higher XP;
rows without XP or level are skipped and counted. Keystone's curve is
`level = floor(xp / 100)`, so an imported level is recomputed rather than trusted
when it disagrees. Files that would require scraping are refused.

ProBot JSON and Ticket Tool HTML transcripts are normalized to text and stored as
a `ticket_transcript` community record. They are archives, not rebuilt Discord
messages.

## Drift

`drift` walks settings for keys ending in `channelId`, `roleId` or `categoryId`
(case-insensitive) and reports missing resources, refused channel permissions
and expected AutoMod rules that are absent. The Discord surface reads live
channels, categories, roles and AutoMod names from the gateway cache through
`apps/bot/src/export-discord.ts`; channel enumeration goes through the one
`cachedChannels()` seam in `apps/bot/src/channels.ts`. The CLI still accepts a
saved fact file. Drift is **read-only**; the report has `readOnly: true`.
Obfuscation means "missing" may mean "hidden from the bot", so the report names
the ambiguity instead of guessing.

## Threat model

| Risk | Control |
| --- | --- |
| Another guild's data imported without authorisation | The destination guild id is an explicit argument; every row is rewritten to it; the CLI requires `--yes` and a database credential; `/export` requires `ManageGuild` and a guild-scoped context |
| Corrupt or edited bundle | Version, schema, checksum and counts verified before a write |
| Partial restore | One transaction, backup first, post-import checksum |
| Deletion claimed but not done | Deletion and receipt in the same operation; backup payloads removed |
| Secret leak in a bundle | Bundles contain member ids and moderation history, not tokens, prompts or attachments; export file is written `0600` |
| Vendor scraping | File-only importers; no browser automation or credential collection |

## Known limits

- Messages and attachments are not exported; Discord does not let a bot
  reconstruct message history it did not store.
- Ticket transcripts are references/archives, not message rows.
- MEE6's live leaderboard endpoint is **not** called. Admins save the JSON the
  source gives them and upload it; this stays within the no-scraping rule.
- `/export import`, `delete` and `rollback` require `DATABASE_URL`; memory mode
  names the prerequisite instead of simulating a transaction.
- A memory-mode guild export omits member profiles and audit events because the
  in-memory stores never retained them. Settings are effective values, not raw
  override rows.
- The prefix bridge cannot carry an attachment option, so `!export import` is
  covered by the command test, not a live bridge run.
- The dashboard, scoped API tokens and webhook notifications are P6.
- Drift reads the gateway cache in Discord and a JSON fact file in the CLI. Both
  are snapshots at call time, not a live permission audit.
