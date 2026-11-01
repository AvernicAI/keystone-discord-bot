# ADR-0018 — Real Discord subcommands, one owning module per root

## Status

Accepted · 2026-11-01 · P7. Related: [[ADR-0003-command-budget]],
[[Command-Budget]], [[Module-Contract]], [[Live-Testing]].

## Context

The kernel initially supported only flat options. Every hub therefore exposed an
`action` string choice (`/mod action: ban`), and the registered Discord command
was one root with a long choice list. Discord's picker showed **11 roots** and
nothing inside them. A user re-invited the bot and reasonably concluded that 100+
planned commands were missing.

The workaround of adding a root per feature would spend the scarcest resource —
Discord's 100 global slots — and would still leave the picker full of
single-purpose names. The master plan already called for real subcommands; the
kernel was the missing piece.

## Decision

1. `defineCommand` accepts `subcommands` (and `groups` for the one allowed level
   of nesting), validates Discord's limits, and exposes the selected path as
   `ctx.commandPath`.
2. `apps/bot/src/adapt.ts` emits real subcommand JSON and walks the nested
   `interaction.options.data` tree into the flat structural `options` map.
   Discord nests a subcommand's arguments; a top-level-only flatten silently
   drops them.
3. **One module owns a root.** Its subcommands live in that module's definition.
   There is deliberately no cross-module registration into another module's root:
   one owner keeps dispatch, guards and docs unambiguous.
4. `/help` reads `ctx.catalog` injected from the same registry Discord is
   registered from. `pnpm commands:catalog` writes the machine and vault copies.
   No hand-maintained command list is allowed.
5. Boot sync compares a canonical name + description + option-tree shape, not
   only names. `pnpm commands:doctor` is the read-only live check.

## Consequences

- 12 roots expose 77 subcommands (89 actions) without spending another global
  slot; `/help` reports the same numbers.
- A payload change that keeps root names is now detected and registered.
- The development `!` bridge parses the subcommand path, so MCP proof exercises
  the same dispatch as slash.
- Slash `InteractionCreate` still needs a human client; the REST shape and the
  adapter payload are now tested separately.
- New roots land with working modules, not as empty placeholders. The 18-root
  plan remains the target.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Keep the flat `action` option | Discord cannot expand it in the picker; it hides the product surface behind a text argument |
| One root per feature | Spends the 100-slot budget on names; MEE6-style sprawl |
| Register all 18 planned roots now | Empty commands advertise features that do not exist and make `/help` lie |
| Let modules contribute subcommands to another module's root | Several owners for one dispatch path; guards and docs drift |
| Clear and re-register on every boot | Two bulk overwrites per ten minutes; a rate-limited register leaves the app empty |
