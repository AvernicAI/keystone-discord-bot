# Setup — teaching notes

## Read in this order

1. `modules/setup/src/commands/setup.ts` — a command that only reads.
2. `modules/setup/src/commands/config.ts` — one root, four subcommands, one
   settings port.
3. `packages/kernel/src/config.ts` — the narrow `ConfigPort`.
4. `packages/kernel/src/settings.ts` — the service that validates and persists.
5. `packages/kernel/src/types.ts` — `HealthProbe` and `HealthReport`, the two
   types `/setup` depends on.
6. `apps/bot/src/runtime.ts` — where the real probe and settings service are
   built.
7. `packages/db/src/health.ts` — `SELECT 1`, then the migration ledger.

## The idea to take away

**Readiness is data, not prose.** `/setup` does not contain a list of `if`
statements about environment variables. It asks a port, and the port returns a
structured report. That is why the same command works in a test with a fake
report and in production against Postgres.

**Configuration is one validated write path.** `/config` does not know how to
store settings. It builds a small patch, hands it to `SettingsService`, and the
service merges, parses with the selected module's Zod schema, and only then
writes. The dashboard does exactly the same thing. That is why an invalid value
cannot enter through one surface while being rejected by the other.

The second idea is restraint: a first-run command that writes configuration can
leave a server half-configured when the third step fails. `/setup` cannot write.
`/config` is a separate, explicit act with a guard and a cooldown.

## Why a dotted key instead of a JSON blob

A whole-module JSON blob is easy to mistype and easy to make lossy: a user who
edits one field may omit another and silently reset it. A dotted key
(`automod.links`) is smaller to type and the patch builder clones the path, so
siblings survive. The full record is still parsed, so cross-field validation is
not lost.

## The bug you should look for

`parseValue` keeps 15–25 digit strings as strings. Remove that branch and a channel
id becomes a JavaScript number; `JSON.stringify` then reveals the rounded value.
Discord snowflakes are larger than `Number.MAX_SAFE_INTEGER`. The test
"keeps a snowflake id as a string" exists to catch exactly this.

The second trap is the prototype chain. A patch builder that does
`target[part] = value` for an arbitrary key can write to `__proto__`. The
command rejects that segment and the other two special names; a key path is not
trusted just because it came from a Discord option.

## Exercise

Add a `/config reset module:<id>` subcommand that clears that module's stored
override and falls back to `defaultSettings`.

You will need to:

1. Add `reset` to `ConfigPort` and implement it in `SettingsService` (it already
   has `reset`, so this is mostly exposing it through the port).
2. Add the subcommand and its `module` option to `config.ts`.
3. Decide what the reply should show after a reset — the effective defaults, not
   an empty object.
4. Add a test that writes a value, resets, and proves the default is back.
5. Run `pnpm check` and `pnpm commands:catalog`.

Notice that the repository gains no new method: clearing a row already exists.
That is the test for whether the new command is using the seam or inventing one.

## The mistake you will probably make

Reading another module's settings to show "is leveling enabled?" directly from
its store. `/config list` avoids that by asking `SettingsService` for each
module, so it sees the same defaults and schema the owner sees. If you find
yourself importing `modules/community/src/store.ts` into setup, stop.

## Stretch

Record a settings-change audit row from `SettingsService.update` — actor,
guild, module, dotted key, old value, new value — and add it to `/logging`'s
event stream. The interesting design question is not the insert; it is whether
the audit write belongs inside the settings transaction or after it. Write the
answer down before the code.
