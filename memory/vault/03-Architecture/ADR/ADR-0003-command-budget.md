# ADR-0003 — A CI-enforced command budget

## Status

Accepted — 2026-10-31.

## Context

Discord gives each application **100 global chat-input commands**, 25 options per
command, 25 choices per option, one level of nesting, and an 8,000-character
payload cap including localisations. Every all-in-one bot eventually hits it.

When teams hit the wall, the usual responses are bad: delete commands users
depend on, hide features behind a single `/help` wall, or ship a prefix-command
system that requires the message-content intent and is invisible to new users.

The number is knowable at build time, which means it should never be a surprise.

## Decision

The registry computes a budget report on every boot, `pnpm budget` prints it, and
`pnpm check` fails when it is exceeded. The bot refuses to start if the budget is
invalid. `memory/machine/project.json` records the current count, and
`memory:check` verifies it stays under the limit.

Features are expected to attach to hub commands (`/setup`, `/config`, `/mod`,
`/ticket`, `/rank`, `/tools`, `/help`) rather than claim roots.

## Consequences

- Command sprawl becomes a failing test instead of a code-review opinion.
- Adding a root command requires updating this ledger and the spec, which forces
  the "could this be a subcommand?" conversation at the right time.
- Each root has **one owning module**; its subcommands are declared there. A
  cross-module contribution mechanism was considered and rejected in
  [[ADR-0018-real-subcommands]] because several owners for one dispatch path
  make guards and docs ambiguous.
- A warning fires at 80 commands, leaving room for the hard conversation before
  the wall.

## Alternatives

| Option | Why it lost |
| --- | --- |
| A wiki page saying "keep it small" | Guidelines lose to deadlines; a test does not |
| Per-feature root commands | Reads nicely, dies at 100; MEE6 is the cautionary tale |
| Prefix commands as the escape hatch | Needs message content (privileged), invisible in the UI, worse for new users |
| Guild-scoped command sets | Each guild still has its own 100 cap and registration is messier |
| One `/keystone` mega-command | Fits the budget, but every action becomes three menus deep |
