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
| `/help` | subcommands `browse`, `commands`, `search`, `privacy`, `changelog`; optional `module` filter or required `query` | none (works in DMs) | In a guild, a Components V2 hub over the live registry and this server's state; in a DM, a flat embed of the same catalog |

## Help hub

`browse` without a module filter renders the hub in a guild. It reads five
sources through ports the bot already owns, and each optional source is allowed
to fail without failing the command:

| Source | Fact | Failure |
| --- | --- | --- |
| `ConfigPort.list` | module name and on/off state | ids and an unknown state |
| `HealthProbe` | database and cache state, disabled features | `unknown` |
| `CommunityPort` | open ticket count | the row is omitted |
| `ModerationPort` | open + alerted case count, only with `ModerateMembers` | the row is omitted |
| `ctx.catalog` | roots, subcommands and context menus | the command's existing missing-catalog refusal |

Ticket and case reads use one 100-row limit. A row at the limit prints `100+`
rather than pretending the count is exact.

The panel is pure: `help/facts.ts` gathers the values and `help/panel.ts` builds
four trees (home, module, privacy, changelog). The command and the component
routes call the same loader, so a picker update cannot disagree with the page
that produced it. Controls are signed `help:` ids with a 15-minute TTL and
`guildOnly`; the route that handles a pick re-reads facts and re-mints every id.
A module page keeps the full module list in its picker, so switching modules does
not require a trip through Overview.

A DM has no guild to bind an id to and no server state to show, so it keeps the
flat embed. `commands`, `search`, `privacy` and `changelog` keep their text
forms; an unknown module is refused by name before any component is written.

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

None. Diagnostics must work on a server where the bot has no roles. The hub
shows the case count only to a caller with `ModerateMembers`, the same gate
`/mod` uses.

## Non-goals

- A status page (that is platform-level, P7).
- Exposing shard or cluster internals (P8).
- Pinging external services to "check uptime" — that turns a status command into
  a monitoring bill.

## Limits respected

- 3 of Discord's 100 global command roots (`/ping`, `/about`, `/help`).
- `/help` reads `ctx.catalog`, injected by dispatch from the same registry
  Discord is registered from; it cannot advertise a missing command.
- One V2 container per page. The home tree uses 9 of Discord's 40 components;
  a module body clips at 3,200 characters and names the roots it left out.
  Every page is built by `packages/ui`, which throws rather than silently
  exceeding 4,000 characters.
- No database access beyond settings, health and the two bounded count reads.

## Verified by

`modules/diagnostics/src/diagnostics.test.ts` — registry, budget, settings
defaults, all three commands, the DM fallback and the module filter.
`modules/diagnostics/src/help/panel.test.ts` — the four trees, a degraded facts
load and a clipped large module. `apps/bot/src/help-interactions.test.ts` — a
signed pick, Overview/privacy, an unknown module and an expired id.
