# Diagnostics — teaching notes

## Read in this order

1. `modules/diagnostics/src/manifest.ts` — the entire contract in 20 lines.
2. `modules/diagnostics/src/commands/ping.ts` — the smallest complete command.
3. `modules/diagnostics/src/commands/about.ts` — settings, guards, embeds.
4. `modules/diagnostics/src/commands/help.ts` — reading a catalog injected by
   dispatch, and why the page is generated.
5. `modules/diagnostics/src/help/facts.ts` — turning five ports into one
   plain object, with every optional source allowed to fail.
6. `modules/diagnostics/src/help/panel.ts` — four pure panel trees; no
   discord.js, no service call, no clock.
7. `apps/bot/src/help-interactions.ts` — the signed routes. They live in the
   bot because only the composition root owns the signer.
8. `packages/kernel/src/dispatch.ts` — what the kernel does *for* those commands.
9. `packages/kernel/src/testing.ts` — why the tests need no token.

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

**The hub is facts, not markup.** The tempting version of `/help` asks Discord
for the guild, walks `client.guilds`, reads each module's store and formats the
result in the command. That couples a reference module to the gateway. The hub
instead receives `ConfigPort`, `HealthProbe`, `CommunityPort` and
`ModerationPort` from the context, gathers plain numbers, and hands them to a
pure builder. A failed source becomes `unknown` or an omitted row, never a
failed command. The same loader runs from a button click, so `/help` and its
picker cannot disagree.

**Controls are capability.** A V2 panel without a signer is a dead end: the
command refuses to post it. The signer binds namespace, action, guild and a
15-minute expiry, and every update mints fresh ids. A DM click is refused before
the handler because the route is `guildOnly`.

## Exercise

Read `/help` and `pnpm commands:catalog` together. The command does not know the
catalog at import time; dispatch injects `ctx.catalog` from the registry, and the
script writes the same data to Markdown and JSON. That is the whole trick behind
"the docs cannot drift": there is one source and two renderers.

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

Second exercise: add a "Modules off" row to the hub only when at least one
module is disabled. Change `HelpFacts`, the builder and one panel test. Notice
that no command, route or Discord type changes — the fact travels through the
same object.

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
