# Data portability — what can actually be imported

> This page is the evidence behind P5 and the narrowed promise:
> **export everything, import where the source allows, guided manual migration
> for the rest.** Claims live in [[Claims]].

## The structural finding

**Nobody exports; somebody imports.** None of the surveyed generalists documents
a complete export of its own config and history. Portability exists because
destination bots implement a pull from a public endpoint or a file upload. The
source bot has no incentive to build egress.

That is why Keystone's wedge is not "click a button and every bot migrates." It
is:

1. **Own your data** — a complete, documented export bundle and restore.
2. **Import where the source permits** — MEE6 levels and user-supplied files.
3. **Guide the rest** — a migration checklist for sources with no egress.

## Feasibility matrix

| Source | What is available | Mechanism | Safe? | Status |
| --- | --- | --- | --- | --- |
| MEE6 | XP, levels, role rewards | Public leaderboard pages, rate-limited | Yes, no credentials | P5 |
| Generic JSON/CSV | `userId` + xp/level/cash/bank | User uploads their own file | Yes | P5 |
| Lurkr | XP, level, message count | JSON attachment | Yes | P5 |
| Polaris | XP/level plus settings | JSON/CSV after the API retirement | Yes | P5 best effort |
| Arcane | XP/levels | User-supplied JSON; console scrape is hostile | Only user-supplied file | P5 file only |
| XP Bot / Level Up | XP/level/activity | JSON attachment | Yes | P5 best effort |
| ProBot | Ticket transcripts | JSON/HTML/plain text to a transcript channel | Yes | P5 JSON |
| Ticket Tool | Ticket transcripts | HTML attachment in Discord; vendor stores nothing | Yes, user-owned file | P5 archive |
| Dyno | Config, cases | No public API or export documented | No | Manual guide |
| Carl-bot | Config, reaction roles, tags | No general export; tags have a narrow import page | Partial (tags) | Manual guide |
| Wick | Config, cases | No API; server imaging is not portable | No | Manual guide |
| Arcane | Full leaderboard | Scraping is unwelcome and can be banned | No | Refuse |

## The export bundle (P5 design)

```
manifest.json          schema version, guild hash, counts, checksum, created_at
settings.ndjson        one row per (module, key, value)
cases.ndjson           moderation cases
case_events.ndjson     append-only transitions
levels.ndjson          current XP projection
xp_events.ndjson       the events that produced it
economy_ledger.ndjson  append-only money
tickets.ndjson         ticket metadata
transcripts/           user-owned HTML/JSON transcript files
community_records.ndjson
audit_events.ndjson
receipt.json           counts and what was included/omitted
```

Rules:

- The bundle is **versioned**; a restore refuses an unknown major version.
- The manifest carries a **checksum**; a corrupt bundle fails before a write.
- Import is **dry-run first**: create/update/skip per record, with a merge mode
  (replace, keep-higher, add-on-top) and a level-curve conversion.
- Apply is **idempotent** on an import id and runs inside a transaction where the
  store supports it.
- A 24-hour **rollback** window restores the pre-import snapshot.
- A **receipt** records imported/skipped/failed counts and the source.
- A **deletion receipt** records what a guild or user deletion removed.
- File cap 25 MB; one import at a time; transcripts are stored as files, not
  parsed into message rows.

## What we refuse

- Scraping a vendor dashboard or public leaderboard where the vendor says no.
- Asking for a user's Discord credentials.
- Importing another server's data without an owner-authorized export.
- Claiming a Dyno/Carl/Wick migration that the source cannot support.

## What the migration guide must say

For each source: what transfers, what must be recreated, what is lost, and why.
A manual guide is a feature, not an apology. It is the difference between a
broken promise and an honest one.

## Why this is P5, not P6

The dashboard needs the bundle, receipts and drift model to display something
real. Building the dashboard first would produce a configuration UI for data that
cannot leave. See [[ADR-0013-roadmap-v2-portability-first]].
