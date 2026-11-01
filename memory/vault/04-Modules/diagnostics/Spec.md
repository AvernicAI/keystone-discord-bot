# Diagnostics — spec

The reference module. It is small on purpose, but it uses every part of the
[[Module-Contract]] so it can be copied.

## Purpose

Answer "is Keystone alive, what version is it, and how is this server
configured?" without a dashboard.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/ping` | none | 3 s cooldown per user | Replies with uptime |
| `/about` | none | guild-only | Ephemeral embed with version, module state and a docs pointer |
| `/help` | subcommands `browse`, `commands`, `search`, `privacy`, `changelog`; optional `module` filter or required `query` | none (works in DMs) | Reads the live registry catalog; never a hand-written list |

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Whether the module is active in this guild |
| `detailed` | boolean | `false` | Reserved for richer diagnostics output |

Settings are validated by the module's Zod schema on every read and write. A
guild that has never run `/setup` still gets the defaults.

## Intents

`Guilds` only. No privileged intents.

## Permissions

None. Diagnostics must work on a server where the bot has no roles.

## Non-goals

- A status page (that is platform-level, P7).
- Exposing shard or cluster internals (P8).
- Pinging external services to "check uptime" — that turns a status command into
  a monitoring bill.

## Limits respected

- 3 of Discord's 100 global command roots (`/ping`, `/about`, `/help`).
- `/help` reads `ctx.catalog`, injected by dispatch from the same registry
  Discord is registered from; it cannot advertise a missing command.
- Zero components, so no V2 slot budget is spent.
- No database access beyond the settings handle.

## Verified by

`modules/diagnostics/src/diagnostics.test.ts` — registry, budget, settings
defaults, both commands, and the duration formatter.
