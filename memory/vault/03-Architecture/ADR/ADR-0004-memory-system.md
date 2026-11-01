# ADR-0004 — Dual memory: Obsidian vault plus machine-readable state

## Status

Accepted — 2026-10-31.

## Context

This project is meant to be built over many passes, by different agents and
humans, while staying teachable. Two kinds of memory are needed:

- **Human memory:** why decisions were made, what was rejected, how to run things.
  Read linearly, linked, readable in a graph.
- **Machine memory:** the current phase, module list, statuses, command count,
  open questions. Read by scripts and agents without parsing prose.

Documentation that drifts is worse than none. A wiki page that claims a feature
exists is a debugging trap, and an agent that trusts stale memory repeats work.

## Decision

`/memory` holds both halves:

- `vault/` — an Obsidian-compatible markdown vault with wikilinks, ADRs,
  per-module specs/status/teaching docs, runbooks and the curriculum.
- `machine/project.json` — schema-validated state: phase, modules, decisions,
  open questions, metrics.
- `journal/` — one entry per pass, with mandatory "what we tried and rejected".
- `tools/memory-check.mjs` — validates the links **in both directions** and is
  part of `pnpm check`.

Every pass ends with `pnpm pass:end`, which scaffolds the journal and prints the
five-item checklist. The pass is not done until all five are green.

## Consequences

- A stale link fails CI, so memory cannot silently rot.
- The journal's rejected-alternatives section is the teaching payload: it is what
  stops the next person re-litigating a settled choice.
- Writing memory costs time on every pass. That cost is the point — it is the
  difference between a project and a pile of commits.
- The vault is public. No secrets, no personal data, no tokens, ever.
- `project.json` is a hand-maintained summary, not a generated build artifact.
  `memory:check` cross-checks the parts that can be verified (folders, docs,
  command names, limits); the rest is honest bookkeeping.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Prose docs only | Agents cannot reliably read state; links rot silently |
| JSON only | Unreadable as a design record; teaches nobody |
| Auto-generated docs from code | Accurate but empty — it cannot record *why* or *what lost* |
| GitHub Issues/Wiki | Splits the record from the repo; no CI validation; export-hostile |
| A database-backed knowledge base | Overkill, and it cannot be read in a PR diff |
