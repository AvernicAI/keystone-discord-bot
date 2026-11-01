# Lesson 1 — the module contract

## The problem

A bot with 200 commands usually has one file that decides what to run:

```ts
client.on("messageCreate", async (message) => {
  const [command, ...args] = message.content.slice(1).split(" ");
  if (command === "ban") { … }
  else if (command === "kick") { … }
  // 200 more
});
```

Three things go wrong, in this order:

1. **The file becomes a merge conflict.** Every feature touches it.
2. **Cross-cutting rules drift.** One author checks permissions, another forgets,
   a third checks the wrong permission.
3. **Tests become impossible.** The handler needs a live client, so nobody writes
   one, so regressions ship.

## The naive fix, and why it is not enough

Move each command into `commands/ban.ts` and load the folder with a glob. Better!
But now the *rules* still live in each file: the cooldown is copy-pasted, the
error handling is different everywhere, and settings reads hit the database
directly with no schema.

Folder structure without a contract is just tidier spaghetti.

## Our version

A module is a folder with one manifest. The kernel owns the pipeline:

```
interaction → adapt → registry lookup → guards → execute → respond
```

Read `packages/kernel/src/dispatch.ts` first. It is ~80 lines and it is the whole
architecture. Then read `modules/diagnostics/src/manifest.ts` and notice that it
contains no Discord code at all.

The two design choices that matter:

- **`InteractionLike` instead of `ChatInputCommandInteraction`.** Our commands
  accept a narrow structural type, so a test can pass a plain object. The cast
  to discord.js happens in exactly one file.
- **The manifest is validated at boot.** A duplicate command name, a 120-character
  description, a required option after an optional one — all fail before the bot
  connects, with a list of every problem.

## Exercise

Run the tests, then break something on purpose:

```bash
pnpm test
# edit modules/diagnostics/src/manifest.ts: description: "x".repeat(120)
pnpm check
```

You should get a startup error naming the command and the limit. Now add a
`/whoami` command following [[Teaching]]'s exercise.

## What we rejected

- **Sapphire's store/piece system.** The same shape, but it owns our types and
  our upgrade cadence. We took the idea and ~300 lines of implementation.
- **Decorators and DI (Necord/NestJS).** Pleasant for a team that already knows
  Nest. For a learner, the first file they open is metadata, not behaviour.
- **A glob loader.** Convenient until Windows casing, bundlers and dynamic
  imports disagree. The explicit `modules` array is boring and correct.

## Check yourself

1. Why can a command not import discord.js, even though the bot obviously uses it?
2. Where does a cooldown live, and what breaks when you run two shards?
3. What happens to a command that throws `new Error("db password")`?
