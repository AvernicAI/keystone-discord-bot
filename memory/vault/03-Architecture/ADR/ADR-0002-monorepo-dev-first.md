# ADR-0002 — pnpm monorepo, dev-first TypeScript resolution

## Status

Accepted — 2026-10-31. Superseded in part at P1 when a production build lands.

## Context

The bot needs a gateway process, a worker, a dashboard and published docs, plus
shared kernel, database, queue and UI packages. That is a monorepo whether we
call it one or not. The question is how much tooling to adopt on day one.

Two failure modes were on the table:

- **Too much:** Turborepo + tsup + per-package tsconfigs + project references
  before the second package exists. Contributors spend their first hour on config.
- **Too little:** one giant `src/` folder. Every feature edits the same files and
  the module boundary becomes a code-review argument instead of a directory.

## Decision

pnpm workspaces with `apps/*`, `packages/*`, `modules/*`. Package `exports` point
directly at `.ts` source, resolved by tsx and Vitest. One root `tsconfig.json`
typechecks the whole workspace. No build step in the contributor loop.

## Consequences

- `git clone && pnpm install && pnpm check` works with no build and no token.
- Cross-package imports are instant and go-to-definition works in every editor.
- This is **not** production-ready on its own: Node cannot execute `.ts` exports.
  P1 must add a build (tsup or `tsc` emit) and a `turbo prune` Docker image before
  anything is deployed. The ADR will be updated, not quietly ignored.
- pnpm's strict `node_modules` forces every package to declare what it imports,
  which is exactly the discipline a teaching repo wants.
- pnpm 12 blocks postinstall scripts by default; `esbuild` is allowed via the
  `allowBuilds` map in `pnpm-workspace.yaml`. Any future entry needs a sentence in
  `SECURITY.md` explaining why.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Turborepo now | Caches a build graph that does not exist yet; config tax on every contributor |
| Nx | Powerful, opinionated, and a second mental model to teach before Discord |
| Single package, folders inside | Cheapest today; makes the worker/dashboard split a refactor later |
| Per-package tsconfigs | Twelve near-identical files and constant merge conflicts |
| Build-on-install | Slows the loop and breaks "edit a file, run the test" |
