# The module contract

A module is a folder that declares everything it needs. The kernel does the rest.

## Anatomy

```
modules/levels/
  package.json          @keystone/module-levels
  src/
    index.ts            export { levelsModule } from "./manifest";
    manifest.ts         defineModule({ id, settingsSchema, commands, intents, … })
    commands/
      rank.ts           defineCommand({ name, description, guards, execute })
    service.ts          pure logic, no Discord objects
    storage.ts          repository interfaces this module owns
    __tests__/          token-free tests
  README.md             for someone browsing the folder
```

## The manifest

```ts
export const levelsModule = defineModule({
  id: "levels",                       // kebab-case, unique, used in settings keys
  name: "Leveling",
  description: "XP, ranks and role rewards.",
  version: "0.1.0",
  settingsSchema: z.object({ … }),    // per-guild settings
  defaultSettings: { … },             // must satisfy the schema (checked at boot)
  commands: [rank, leaderboard],
  intents: ["GuildMembers"],          // only what is genuinely needed
  permissions: ["ManageRoles"],
  docsPath: "04-Modules/levels/Spec.md",
});
```

**Boot-time validation** rejects: non-kebab ids, duplicate ids, duplicate command
names across modules, descriptions over 100 chars, more than 25 options, required
options after optional ones, and default settings that violate the module's own
schema.

## Adding a module (the whole procedure)

1. Copy `modules/diagnostics` and rename the folder, package name and manifest id.
2. Write `Spec.md` in the vault: what it does, what it refuses to do, the
   settings, the commands, the limits it respects.
3. Implement `service.ts` with pure functions first. It is the part you test.
4. Add commands. Each gets `defineCommand`, a description, guards, `execute`.
5. Add the manifest to `packages/module-catalog/src/index.ts`; `apps/bot/src/modules.ts` re-exports that shared list for the gateway.
6. Add the module to `memory/machine/project.json` with its spec/status paths.
7. `pnpm check` — typecheck, tests, budget, memory links.

There is no step where you edit another module, and no central command switch.

## Rules

| Rule | Why |
| --- | --- |
| Commands must not import discord.js | Keeps tests token-free and the v15 migration contained |
| Settings live in the DB, never in a file | A JSON config is the anti-pattern that kills self-hosted bots |
| One module owns one domain | Cross-module reads go through exported service functions, not their tables |
| Declare the intents you need | Each privileged intent is a review and an annual renewal |
| Guards before logic | Permission/cooldown checks are the kernel's job, not the command's |
| `UserError` for anything a user should see | Everything else is redacted |
| Tests are part of the module | A module with no tests is not merged |

## The teaching half

Every module ships three vault docs:

- **Spec.md** — the contract. Written before the code.
- **Status.md** — what works, what is stubbed, what is next, what is verified.
- **Teaching.md** — the guided read: which file to open first, the exercise to
  extend it, the mistake you will probably make.

`pnpm memory:check` fails if the spec does not mention every registered command,
so the docs cannot silently drift from the code.

## What a hub command is

Because of the [[Command-Budget]], features share root commands. A root is owned
by exactly one module; its subcommands are declared on that module's command and
run through the same guards and dispatch:

```ts
export const tools = defineCommand({
  name: "tools",
  description: "Community utilities.",
  subcommands: [
    { name: "poll", description: "Post a poll.", options: [...] },
    { name: "giveaway", description: "Start a giveaway.", options: [...] },
  ],
  async execute(ctx) {
    const selected = ctx.commandPath[0]; // "poll" | "giveaway"
    ...
  },
});
```

Subcommands do not spend another global slot. There is deliberately **no**
cross-module registration into another module's root: that would make one root
have several owners and hide which module answers a request. Put the command in
the module that owns the domain, or add a new root with its module.
