# Setup — status

## Now

P1 complete.

- `/setup` registered through `apps/bot/src/modules.ts`, behind `ManageGuild`.
- Reports database reachability, migration state, cache mode and module state.
- Three readiness branches are covered by tests; the command never writes.

## Verified

```
pnpm test                          # 56 tests, including modules/setup
pnpm budget                        # 3/100, status OK
node dist/bot.js (no token)        # build artefact runs; refuses with a clear message
```

P1 exit evidence for this module:

- `/setup` registers through `apps/bot/src/modules.ts` and the normal registry.
- Dispatch blocks a member without `ManageGuild` and allows one with it.
- Ready, missing-database, pending-migration and disabled-module states are
  asserted; the module enabled state comes from its own settings.
- A repository spy that throws on `set`/`clear` proves the command never writes.
- Proven with fixtures and a fake health probe. A live Postgres/Redis run is
  still outstanding and is named in [[01-Mission/Status|project status]].

## What it proves

The health port is wired to the real adapters in `apps/bot/src/runtime.ts`, so
the values in the embed come from the same handles the bot uses — not from a
parallel configuration check that could disagree with reality.

## Known limitations

- It cannot verify Discord permissions or channel layout; that is P2's
  verification work, not a readiness check.
- When `DATABASE_URL` is unset, it reports "settings are in memory" rather than
  failing. That is the supported local mode, and the warning is loud.
- No Redis means the worker cannot run; `/setup` says "not configured" instead
  of pretending cooldowns are shared.

## Next

- P2: add a first-run check for the intents the installed modules require.
- P5: link the dashboard's setup page to this same health probe.
