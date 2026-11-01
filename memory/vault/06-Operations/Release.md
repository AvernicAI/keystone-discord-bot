# Runbook — release

## Before you tag

```bash
pnpm check          # typecheck, tests, budget, memory links
pnpm budget         # confirm the ledger matches memory/machine/project.json
```

`pnpm check` is the gate. If it is red, there is no release, and "it's just docs"
is not an exception — `memory:check` exists because docs drift.

## Versioning

Semver, but the meaningful axis is the **contract**:

- **major** — `CommandContext`, `ModuleManifest` or `InteractionLike` changed
  incompatibly. Every third-party module needs edits.
- **minor** — new module, new command, new optional manifest field.
- **patch** — fix, docs, internal refactor.

## Steps

1. Update `package.json` version and `CHANGELOG.md` (Added / Changed / Fixed /
   Security). Link the ADR for any contract change.
2. Add a vault `Status.md` line for anything promoted to stable.
3. `pnpm check` green on the release commit.
4. Tag `vX.Y.Z`, push the tag, let CI build the image.
5. Run migrations as a **separate one-shot job**, never on bot boot: two replicas
   booting at once must not race.
6. Deploy, then watch the first 15 minutes (see below).
7. Update `memory/machine/project.json` (`updatedAt`, metrics) and write the
   release note into the journal.

## First 15 minutes

- Bot logged `ready` with the expected guild count.
- `commands registered` count equals the budget ledger.
- No `invalid request` or 429 spike.
- One real `/ping` and one real `/about` in a test server.
- Error rate at or below the previous hour.

## Rollback

Redeploy the previous tag. Migrations are forward-only by policy: a rollback must
not require a down-migration, so every schema change must be backwards-compatible
for one release (expand → migrate → contract).

## Never

- Never deploy on a Friday afternoon without a second person available.
- Never `prisma migrate`-style auto-run on boot.
- Never tag from a dirty working tree.
