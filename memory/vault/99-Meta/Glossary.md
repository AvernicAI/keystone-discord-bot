# Glossary

| Term | Meaning here |
| --- | --- |
| **Module** | A folder under `modules/` exporting one manifest. The unit of feature ownership. |
| **Manifest** | `defineModule({…})` — id, settings schema, commands, intents, permissions, docs path. |
| **Kernel** | `packages/kernel`. Registry, guards, settings, dispatch, budget. Knows nothing about discord.js. |
| **Guard** | A middleware function run before a command: guild-only, permission, cooldown. |
| **Dispatch** | The single pipeline: resolve → guard → execute → respond. |
| **Hub command** | A root slash command that hosts many subcommands (`/config`, `/mod`). |
| **Command budget** | Discord's 100 global chat-input commands, tracked in CI. |
| **Component budget** | Components V2's 40 components per message, including nested. |
| **V2** | `IS_COMPONENTS_V2` message flag; replaces `content`/`embeds`, irreversible. |
| **Intent** | Gateway subscription. Three are privileged and reviewed. |
| **ADB** | Not used. (If you saw it elsewhere, it meant "all-in-one Discord bot".) |
| **Case** | A moderation record: actor, target, action, reason, evidence, timestamp, appeal state. |
| **Evidence card** | The message shown to moderators with the content that triggered a rule. |
| **Dry-run** | Detect and log, take no action. The default posture. |
| **Fleet** | Multiple guilds under one dashboard/account. |
| **Drift** | Two guilds' config diverging when they were meant to be identical. |
| **Importer** | A one-way migration from MEE6/Dyno/Carl/Ticket Tool data. |
| **Entitlement** | Discord's source of truth for paid access (not the subscription record). |
| **Pass** | One unit of work that must end with a journal entry and green `pnpm check`. |
| **Vault** | `memory/vault`, the Obsidian-readable half of memory. |
| **Machine memory** | `memory/machine/project.json`, the schema-checked state. |
