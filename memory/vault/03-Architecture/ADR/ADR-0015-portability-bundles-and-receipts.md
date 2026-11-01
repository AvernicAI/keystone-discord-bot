# ADR-0015 — Portability bundles, narrow merge and receipts

## Status

Accepted · 2026-10-31 · P5

## Context

The data-ownership promise is the wedge: every generalist locks data in, and the
dashboard cannot show a restore it has no model for. The research pass
([[Import-Formats]]) found no surveyed bot with a complete config-and-history
export, and no usable egress from Dyno, Carl-bot or Wick.

At the same time, a "restore" is the most dangerous write in the product. It
deletes a guild's rows and replaces them. It must be verifiable before it starts,
atomic while it runs, reversible after it finishes, and honest about what it
cannot carry.

## Decision

1. **One versioned JSON bundle** (`keystone.export`, v1, 25 MB) with a manifest,
   SHA-256 checksum over canonical JSON, and row plus unique counts. Unknown
   major versions, corrupt checksums, guild mismatches and count mismatches are
   refused before a write.
2. **One transactional replace** for a full restore. The destination guild id is
   an explicit argument; every row is rewritten to it, so cross-guild data cannot
   be smuggled in by editing a file. Inserts are chunked under Postgres's
   parameter ceiling.
3. **A pre-import backup and a 24-hour rollback.** The backup is a full snapshot
   in `backups`; rollback is another transactional replace. Failures roll back
   the transaction and still write a `failed` receipt.
4. **Merge is narrow: settings and levels only.** History is never concatenated;
   duplicate case numbers and money with no shared provenance are worse than a
   named limitation. Level merge modes are `replace`, `keep-higher`,
   `add-on-top`.
5. **Receipts are durable and content-minimal.** `imports` records source, mode,
   diff, counts, checksum, backup id, actor and verification. A deletion receipt
   keeps counts and a hash, deletes backups, and never keeps the deleted content.
6. **File importers, not scraping.** MEE6 leaderboard JSON, generic JSON/CSV,
   Lurkr/Polaris/Arcane/XP Bot files, ProBot JSON and Ticket Tool HTML are
   accepted as user-supplied files. Vendor dashboards are never automated.
7. **Drift is report-only.** Settings ids are compared with supplied live facts;
   the report says "missing" because obfuscation makes hidden and deleted
   indistinguishable over HTTP. No auto-repair.
8. **Transcripts are archives.** They are normalized text in
   `community_records`, not reconstructed messages or live tickets.

## Consequences

- A restore is verifiable: `verified` is a post-write checksum comparison, not a
  hope. A false value is a loud failure in the CLI.
- A 5,000-member round trip is covered by a PGlite test, including JSON fidelity
  for numeric strings (the P0 bug class).
- `packages/db` depends on `packages/importer` for the port types; features still
  depend on their narrow stores. Only the composition root and CLI see the broad
  portability port.
- Merge cannot satisfy "combine two servers' history", and we say so in the
  command help rather than pretending.
- The bundle includes personal data (member ids, moderation history); the CLI
  writes `0600`, and the docs call it an incident-grade export.
- Live MEE6 pulling, dashboard wiring of drift and scoped API tokens remain P6+
  work.

## Alternatives

- **NDJSON bundle.** Better streaming and memory at 500k rows. Rejected for v1:
  one JSON file is a checksum, a download and a lesson; the 25 MB cap is explicit.
  The manifest can add NDJSON in v2 without breaking clients.
- **One-click pull from every vendor.** Rejected: only MEE6 has a plausible
  public leaderboard, and scraping the rest violates terms and user trust.
- **Merge all history by rewriting ids.** Rejected: case numbers, ledger
  provenance and ticket channels cannot be merged without inventing history.
- **No backup, rely on the export.** Rejected: rollback must work even when the
  original bundle is lost or was never made.
- **Delete receipts that keep a hidden copy.** Rejected: a deletion that retains
  the data is not a deletion. Counts and a hash prove scope without retaining
  content.
- **Auto-repair drift.** Rejected: a permission bug could recreate or delete the
  wrong channel during an incident; a report is the safe interface.
- **A full JSON-Schema library for rows.** Deferred: Zod row schemas and the
  checksum cover the failure modes; a second validator would be another thing to
  keep in sync.
