# Diagnostics — teaching notes

## Read in this order

1. `modules/diagnostics/src/manifest.ts` — the entire contract in 20 lines.
2. `modules/diagnostics/src/commands/ping.ts` — the smallest complete command.
3. `modules/diagnostics/src/commands/about.ts` — settings, guards, embeds.
4. `packages/kernel/src/dispatch.ts` — what the kernel does *for* those commands.
5. `packages/kernel/src/testing.ts` — why the tests need no token.

## The three ideas to take away

**A module declares, it does not register.** There is no `client.on` in this
folder. The kernel reads the manifest and wires the commands.

**Guards are composition, not conditionals.** `/about` says `guards:
[requireGuild]`. It does not check `if (!interaction.guildId)` — well, it does
once, only to satisfy TypeScript, and that duplication is a known papercut worth
fixing in P1 with a typed guild context.

**Settings are schema-first.** `defaultSettings` is not a fallback object; it is
data that must satisfy `settingsSchema`, checked at boot. That is why a typo in a
default fails the test suite instead of surprising a server owner.

## Exercise

Add a `/diagnostics whoami` command that replies ephemerally with the caller's
user id, guild id and the guild's `detailed` setting.

Steps:

1. Add `whoami` to `commands/`.
2. Give it `guards: [requireGuild]`.
3. Read settings via `ctx.settings.get(guildId)`.
4. Add it to the manifest's `commands` array.
5. Write a test with `createTestContext` and assert the embed fields.
6. Run `pnpm check`.

The check will fail at `memory:check` until you document `/whoami` in
[[Spec]] — that is not a bug, it is the point.

## The mistake you will probably make

Reaching for `interaction.guild` or `interaction.options.getUser(...)` directly.
`InteractionLike` is deliberately narrow: it has no `options`, no `guild` and no
`client`. Add the accessor to the kernel type and the adapter together, with a
test, or you have quietly reintroduced a discord.js dependency into a module.

## Stretch

Make `/ping` report gateway latency instead of uptime. You will need a new
kernel port (`ctx.client.ping()`), an adapter implementation, a fake in
`packages/testing`, and a decision about whether a null ping (not connected) is
an error or a dash. Write one paragraph in [[Status]] about the choice.
