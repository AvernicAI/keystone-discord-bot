# ADR-0005 — A module contract instead of a central command switch

## Status

Accepted — 2026-10-31.

## Context

Every bot codebase starts with `client.on("messageCreate")` and a chain of `if
(command === …)`. It works for ten commands and becomes the reason nobody
contributes at three hundred: every feature touches the same file, every PR
conflicts, and permission checks get copy-pasted with subtle differences.

The open-source research was consistent on this point. Red-DiscordBot stays
maintainable because a cog is a self-contained unit with a declared interface.
TSCord is pleasant because guards are middleware, not `if` chains. The bots that
rotted did the opposite.

## Decision

A module is a folder exporting one manifest:

```ts
defineModule({ id, settingsSchema, defaultSettings, commands, intents, permissions })
```

Every command is `defineCommand({ name, description, options, guards, execute })`.
The kernel provides dispatch, guards, schema-validated settings, error redaction
and the budget ledger. Registration is one line in `apps/bot/src/modules.ts`.

Manifests are validated at registration: ids, duplicate command names, option
ordering, description length, and self-consistency of defaults with the schema.

## Consequences

- Adding a feature touches one new folder plus one line. No central switch, no
  merge conflicts with unrelated work.
- Every command inherits the same guard/error/response pipeline, so correctness is
  the default rather than a per-author achievement.
- Contributors must learn the contract before their first PR. That is why
  `modules/diagnostics` exists as a copyable example and why lesson one is the
  contract itself.
- The contract is a public API from day one: changing `CommandContext` is a
  breaking change for every module, so it needs an ADR.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Central command switch | Simple for a week, unmaintainable at scale, conflict-heavy |
| Sapphire stores/pieces | Same idea, but couples our types and release cadence to a framework |
| Class-based commands with decorators | Familiar to NestJS users, noisy for learners, harder to type without DI |
| File-system glob loading | Convenient, but path/casing behaviour differs on Windows and bundlers |
| One package per module published to npm | Great distribution story, terrible review story, version matrix from hell |
