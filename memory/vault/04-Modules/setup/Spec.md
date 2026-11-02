# Setup — spec

The operator's first two questions: *is this deployment ready?* and *what is
configured here?* `/setup` answers the first and changes nothing. `/config` is
the explicit, schema-validated settings surface. `/export` makes the same
portability bundle the CLI writes reachable without a terminal.

## Purpose

Replace the usual first-run wizard — which writes configuration before checking
whether the database exists — with a read-only readiness report, then let an
authorized admin change any module's real settings through the same
`SettingsService` the bot and dashboard already use.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/setup` | none | guild-only, `ManageGuild` | Ephemeral embed: health areas, this module's enabled state, the intents modules require, and the next step |
| `/config list` | none | guild-only, `ManageGuild`, 2s cooldown | Every registered module with its enabled state and effective key count |
| `/config get` | `module`, optional `key` | same | One module's effective settings, or one dotted key |
| `/config set` | `module`, `key`, `value` | same | Parse the value, apply a dotted patch, validate the whole record with the owning module's schema, then persist |
| `/config export` | none | same | Versioned JSON of every module's effective settings |
| `/export guild` | none | guild-only, `ManageGuild`, 5s cooldown | Verified `keystone.export` bundle as a JSON attachment, with counts and checksum |
| `/export user` | `user` | same | One member's cases, case events, tickets, levels, XP events and economy rows |
| `/export import` | `bundle`, optional `mode`, optional `dry_run` | same | Reads a CDN attachment, verifies the bundle, previews by default; `dry_run:false` writes |
| `/export delete` | `confirm` | same | Deletes guild rows and backups only when `confirm` is this server's exact id; returns a count-only receipt |
| `/export drift` | none | same | Compares stored channel/role/category ids with live gateway facts; read-only |
| `/export rollback` | `import_id` | same | Restores the 24-hour pre-import backup of an applied import |

`/setup` never calls `settings.update`. `/config` is the only settings write path
in this module, and every write goes through `SettingsService.update`. `/export`
adds data operations, not a second settings store: it calls the `ExportPort`, and
the SQL adapter constructs the same `PortabilityService` the CLI uses.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Whether this module is enabled in the guild |

`/config` can read and write this key like any other module's, but it acts on
the selected module's schema, not a setup-only schema.

## The port

`packages/kernel/src/config.ts` defines `ConfigPort`:

```text
list(guildId)                        -> ConfigModuleView[]
get(guildId, moduleId)               -> effective settings
update(guildId, moduleId, patch)     -> validated effective settings
```

`SettingsService` implements it; the command receives it as `ctx.config`.
The port deliberately exposes no repository, no raw table and no secret. A
module's manifest remains the only schema authority.

## Value parsing and safety

- `JSON.parse` when the value is valid JSON; otherwise the bare string is used.
- Snowflake-shaped strings (`15–25` digits) are kept as strings before parsing,
  because Discord ids exceed `Number.MAX_SAFE_INTEGER`.
- Dotted keys are cloned into a patch, not applied to the current object.
- Key segments must match `[A-Za-z][A-Za-z0-9_-]*`; `__proto__`, `constructor`
  and `prototype` are refused.
- A Zod failure becomes a readable `UserError` naming the failing path; nothing
  is stored.

## Intents

`Guilds` only. The **Intents** field in `/setup` is a report, not a request: it
lists each manifest's `intents` declaration so an operator knows which
privileged intents the installed modules need before inviting or verifying the
app (ADR-0012).

## Permissions

`ManageGuild` to run either root. The bot needs no role to answer, because
`/setup` reads the local runtime, the registry and the settings store, and
`/config` reads or writes the existing settings repository.

## What `/setup` reads

- `HealthProbe` — database configured/reachable/migrated, cache configured/reachable.
- This module's own settings — never another module's.
- `ModuleRegistry` — only the public `manifests` list, for the intents field.

The database check comes from `@keystone/db`'s `probeDatabase`: `SELECT 1`, then
the `schema_migrations` ledger. It never runs a migration.

## Non-goals

- A multi-step wizard. Setup is a report, not a state machine.
- Writing defaults to the database on boot. Defaults come from each module's
  manifest.
- Hiding a failure behind "you're all set". A missing database says so.
- A second settings store or a web-only schema. `/config` and the dashboard both
  call `SettingsService.update`.
- Checking Discord permissions or guild structure. That is a different command.
- Validating that a stored channel/user id still exists. The owning module's
  schema decides what a valid value means.

## Limits respected

- 3 of Discord's 100 global roots (`/setup`, `/config`, `/export`); `/config` has
  four and `/export` six subcommands that cost no additional slot. The current
  ledger was `18/100` roots at this pass (now `20/100`).
- `/config` and `/export` have at most three options on one subcommand, well
  under Discord's 25.
- No privileged intents.
- `/export import` reads only `cdn.discordapp.com` / `media.discordapp.net` over
  HTTPS and caps the body at 25 MB before parsing; a pasted arbitrary URL is
  refused before `fetch`.

## Verified by

`modules/setup/src/setup.test.ts` — registry, budget, readiness states, the
permission guard declaration, the no-write spy, and the intents field.

`modules/setup/src/config.test.ts` — root and subcommand shape, budget,
non-admin rejection with no write, nested dotted writes, snowflake preservation,
schema rejection with no write, single-key reads, unknown-module list and the
export shape.

`modules/setup/src/export.test.ts` — one root and six subcommands, permission
refusal before the port, file/checksum/counts in the guild reply, member
filtering, import preview vs write, exact-id delete confirmation, read-only
drift and rollback. The SQL path is covered by `packages/db/src/portability.test.ts`;
`apps/bot/src/export-port.test.ts` covers the memory adapter and
`apps/bot/src/export-discord.test.ts` covers CDN-only attachment reading.
