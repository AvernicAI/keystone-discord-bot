# Setup — status

## Now

P1 complete; `/config` added in pass 30 (2026-11-01).

- `/setup` registered through the shared module catalog (`packages/module-catalog`), behind `ManageGuild`.
- Reports database reachability, migration state, cache mode, module state and
  the intents each manifest requests (P4.5, ADR-0012).
- Three readiness branches are covered by tests; `/setup` never writes.
- `/config list | get | set | export` reads and writes any registered module's
  per-guild settings through `SettingsService` and the owning Zod schema. It has
  its own 8-test suite and no second settings store.

## Verified

```text
pnpm typecheck
pnpm vitest run modules/setup/src   # 15 tests / 2 files
pnpm test                           # 298 tests / 47 files
pnpm budget                         # 15/100 roots · 94 subcommands
pnpm commands:doctor                # Registry 15 roots · 94 subcommands
```

P1 exit evidence for `/setup`:

- `/setup` registers through the shared module catalog and the normal registry.
- Dispatch blocks a member without `ManageGuild` and allows one with it.
- Ready, missing-database, pending-migration and disabled-module states are
  asserted; the module enabled state comes from its own settings.
- A repository spy that throws on `set`/`clear` proves the command never writes.
- Proven with fixtures and a fake health probe. A live Postgres/Redis run is
  still outstanding and is named in [[01-Mission/Status|project status]].

Pass 30 evidence for `/config`:

- A synthetic fixture module with a nested schema proves the schema is the gate,
  not the command: `nested.flag=false` writes, `mode=bogus` is rejected and the
  repository stays empty.
- A snowflake string survives unchanged, which a plain `JSON.parse` would round.
- The real dispatch pipeline blocks a member without `ManageGuild` before any
  read or write.
- Live in `#ai-chat`: `alert -> delete -> alert` on
  `moderation.automod.links`, read back after each write; `bogus` returned
  `automod.links: Invalid enum value` and the next read still returned `"alert"`.
- One bot process performed one drift-triggered clear + re-register, and
  `commands:doctor` reports 15 roots / 94 subcommands including `config`.

## What it proves

`/setup`'s health port is wired to the real adapters in
`apps/bot/src/runtime.ts`, so its values come from the same handles the bot uses
— not from a parallel configuration check that could disagree with reality.

`/config` demonstrates that the bot and the dashboard share one write path. A
value that the dashboard accepts and a value that `/config` accepts are parsed
by the same schema and persisted through the same service. That is the property
that stops a guild's settings from depending on which surface edited it last.

## Known limitations

- `/setup` cannot verify Discord permissions or channel layout; that is P2's
  verification work, not a readiness check.
- When `DATABASE_URL` is unset, `/setup` reports "settings are in memory" rather
  than failing. That is the supported local mode, and the warning is loud.
- No Redis means the worker cannot run; `/setup` says "not configured" instead
  of pretending cooldowns are shared.
- `/config` validates shape, not referents: a syntactically valid channel id can
  be stored even if the channel no longer exists. That check belongs to the
  owning module.
- Settings changes are not yet in the audit ledger, so `/config set` leaves no
  who-changed-what row. It is visible through `/config get` and `export`.
- The live run used memory mode because the configured local Postgres/Redis
  endpoints returned `ECONNREFUSED`; settings reset when the process stops.
- The MCP cannot invoke slash commands or render embeds, so the live proof is
  the message bridge with plain-text replies; the list and export embeds are
  covered by the command test.

## Next

- Add a settings-change audit row (actor, guild, module, dotted key, old/new)
  before `/config` is used in production.
- P6: link the dashboard's setup page to the same health probe.
- P7: `/help` can render the same manifest data as documentation.
