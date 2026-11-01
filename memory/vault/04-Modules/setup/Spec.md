# Setup — spec

The first command an operator runs. It answers "is this deployment ready?" and
changes nothing.

## Purpose

Replace the usual first-run wizard — which writes configuration before checking
whether the database exists — with a read-only readiness report that names the
exact command to fix each gap.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/setup` | none | guild-only, `ManageGuild` | Ephemeral embed: health areas, this module's enabled state, the intents modules require, and the next step |

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Whether this module is enabled in the guild |

No write path exists in this module. `/setup` never calls `settings.update`.

## Intents

`Guilds` only. The **Intents** field is a report, not a request: it lists each
manifest's `intents` declaration so an operator knows which privileged intents
the installed modules need before inviting or verifying the app (ADR-0012).

## Permissions

`ManageGuild` to run. The bot needs no role to answer, because every check reads
the local runtime, the registry and the settings store.

## What it reads

- `HealthProbe` — database configured/reachable/migrated, cache configured/reachable.
- This module's own settings — never another module's.
- `ModuleRegistry` — only the public `manifests` list, for the intents field.

The database check comes from `@keystone/db`'s `probeDatabase`: `SELECT 1`, then
the `schema_migrations` ledger. It never runs a migration.

## Non-goals

- A multi-step wizard. Setup is a report, not a state machine.
- Writing defaults to the database. Defaults come from each module's manifest.
- Hiding a failure behind "you're all set". A missing database says so.
- Checking Discord permissions or guild structure. That is a different command.

## Limits respected

- 1 of Discord's 100 global commands.
- Zero components; one embed with at most six fields.
- No privileged intents.

## Verified by

`modules/setup/src/setup.test.ts` — registry, budget, all three readiness states,
the permission guard declaration, the no-write spy, and the intents field.
