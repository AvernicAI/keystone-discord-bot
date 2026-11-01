# ADR-0014 — Memory v2: machine truth, generated Markdown

## Status

Accepted · 2026-10-31 · P4.5

## Context

The vault was honest but prose-heavy. `project.json` tracked modules and
metrics, while the parity matrix, research claims and decision log were
hand-maintained Markdown. That is exactly the shape that drifts: a status page
says a feature is shipped, the matrix says open, and no check notices.

The mission requires memory to be an Obsidian vault **and** a machine-readable
memory updated on every pass.

## Decision

Machine files are the source of truth for status:

- `features.json` — every parity row with domain, phase, status, source,
  evidence and live-verification flag.
- `research.json` — every external claim with source, retrieval date,
  confidence and expiry.
- `passes.json` — the pass ledger, linked to a journal.
- `decisions.json` — the ADR index, linked to the ADR file.
- `project.json` — phase, modules, metrics, open questions.

`pnpm memory:render` generates human pages from those files:
`Feature-Status.md`, `Claims.md`, `Decision-Index.md`, `Pass-Ledger.md`.
Generated files carry a "do not edit by hand" header. `pnpm memory:check`
recomputes them and fails when they are stale, in addition to checking journal
sections, ADR alternatives, research expiry, feature evidence and vault links.

Prose that cannot be generated — teaching notes, retrospectives, research
analysis, runbooks — stays hand-written in the vault.

## Consequences

- Status cannot drift silently; a stale generated page fails CI.
- A feature row needs a phase, status, source and, when shipped, an evidence
  path. That is more work than a sentence, and it is the point.
- A research claim needs an expiry; an old claim becomes a warning or a failure
  rather than a rumour.
- The vault remains readable in Obsidian because the generated pages are plain
  Markdown with wikilinks.
- `memory:check` grows from a folder check into a small integrity system; it must
  stay fast enough for every pass.

## Alternatives

- **Keep prose only and add more manual checklists.** Rejected: the drift is the
  failure mode, and a checklist does not notice a stale number.
- **Move everything into JSON and generate the whole vault.** Rejected: teaching
  notes and retrospectives are not data; generating them would flatten the part
  a learner reads.
- **Add a database for memory.** Rejected: a repo that cannot be read on GitHub
  without a service is not open-source memory.
- **Use Obsidian Dataview or Bases.** Rejected as the only mechanism: the vault
  must render on GitHub and in a plain editor, with no plugin install.
- **Validate with a full JSON-Schema library.** Deferred: the integrity checks
  are small and dependency-free today; a schema library can come when the files
  outgrow a page of validation.
