# Portability runbook

> Design: [[Portability]]. Source limits: [[Import-Formats]]. Evidence:
> [[Feature-Status]]. The CLI is `scripts/portability.ts`.

## Before you touch anything

1. Run against a **staging database** the first time. `DATABASE_URL` is the only
   service the CLI needs.
2. Export first, always. The bundle is the only copy that survives a bad import.
3. Read the dry run. `--dry-run` writes nothing and prints the setting diff and
   record counts.
4. A destructive action needs `--yes`. That is deliberate friction, not a bug.

```bash
export DATABASE_URL='postgres://keystone:keystone@localhost:5432/keystone'
pnpm portability export 123456789012345678 ./backups/guild-2026-11-01.json
```

The file is written with mode `0600`. It contains member ids and moderation
history; treat it like an incident export, not a public data dump.

## Restore a Keystone bundle

```bash
# preview: parse, verify, diff, write nothing
pnpm portability import ./backups/guild-2026-11-01.json 123456789012345678 --dry-run

# apply: replace is full fidelity
pnpm portability import ./backups/guild-2026-11-01.json 123456789012345678 --mode replace --yes

# or merge settings + levels only
pnpm portability import ./backups/guild-2026-11-01.json 123456789012345678 --mode merge --levels keep-higher --yes
```

The receipt prints `verified: true` when the post-import checksum matches the
bundle. If it is `false`, stop and inspect the receipt; do not announce success.

### Rollback

```bash
pnpm portability rollback <importId>
```

Only an `applied` import can roll back, only within 24 hours, and only while its
pre-import backup exists. Rollback restores the whole pre-import snapshot.

## Import levels from a file

```bash
# MEE6 saved leaderboard JSON, a generic JSON export, or CSV/TSV
pnpm portability levels ./mee6-leaderboard.json 123456789012345678 --dry-run
pnpm portability levels ./mee6-leaderboard.json 123456789012345678 --mode keep-higher --yes
```

Modes:

| Mode | Effect |
| --- | --- |
| `replace` | set XP to the file's value |
| `keep-higher` | keep the larger of current and imported XP |
| `add-on-top` | add imported XP to current XP |

The level is recomputed with Keystone's curve (`floor(xp / 100)`). Duplicate file
rows keep the higher XP; bad ids and rows with no XP/level are skipped and
counted in the receipt. The importer reads your saved file; it never scrapes a
vendor.

### Which source files work

| Source | File | Notes |
| --- | --- | --- |
| MEE6 | Leaderboard JSON with `players[]` | Save the JSON your admin tool gives you; no live pull |
| Lurkr / Polaris / XP Bot / Level Up | JSON array or wrapped `levels`/`users`/`members` | Common header names are mapped |
| Arcane | User-supplied JSON only | Console scraping is refused |
| Generic | CSV/TSV with `user_id` + `xp`/`level` | Quoted cells and CRLF supported |
| Keystone | Its own export bundle | Use `import`, not `levels` |

## Archive a transcript

```bash
pnpm portability transcript ./ticket-123.json 123456789012345678
pnpm portability transcript ./ticket-123.html 123456789012345678
```

The CLI extracts readable text, counts messages where possible and stores a
`ticket_transcript` community record. It does not recreate Discord messages or
restore a live ticket channel.

## Drift report

Create a `live.json` fixture from the guild's current facts:

```json
{
  "channels": ["444444444444444444"],
  "roles": ["555555555555555555"],
  "categories": [],
  "automodRules": ["keystone-words"],
  "channelPermissions": {
    "444444444444444444": { "ViewChannel": true, "SendMessages": false }
  }
}
```

```bash
pnpm portability drift 123456789012345678 ./live.json
```

The report is read-only. A missing id may mean deleted **or** hidden by the
2026-11-16 channel obfuscation rollout; fix the setting or the bot's permissions,
never both blindly.

## Delete a guild's data

```bash
pnpm portability export 123456789012345678 ./backups/final.json
pnpm portability delete 123456789012345678 --yes
```

Deletion removes guild rows, cases, ticket metadata, levels, XP events, ledger,
audit events, community records, AI documents/usage, settings and **backups**.
It writes a receipt with counts and a content hash, not the content. Export first
if you might need the data.

## Failure playbook

| Symptom | Meaning | Action |
| --- | --- | --- |
| `Bundle checksum does not match` | file edited or truncated | use the original export; do not hand-edit |
| `version N is not supported` | older/newer format | use a matching Keystone build; never force |
| `Import failed and was rolled back` | transaction refused | read the receipt's `error`; the old guild is intact |
| `Post-import checksum did not match` | committed but unverified | stop, compare counts, restore the backup or bundle |
| `24-hour rollback window has closed` | backup expired by policy | restore an export bundle |
| `DATABASE_URL is required` | CLI cannot reach Postgres | start compose Postgres and export the variable |

## What is not here yet

- dashboard buttons, per-guild OAuth and scoped API tokens (P6);
- live MEE6 fetch, which stays out until the terms are explicit;
- message/attachment export (Discord does not expose it).
