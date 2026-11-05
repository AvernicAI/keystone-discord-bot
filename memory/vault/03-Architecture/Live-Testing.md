# Live testing without slash invocation

## Why this exists

An external Discord MCP, or any other bot, can post and read messages but cannot
invoke an application command. The `discord-mcp` server can register a guild
command (`commands_create_guild`) but has no tool that runs one; its **Use Slash
Command** install permission is a permission for that account inside the Discord
client, not an API. A bot token cannot create another application's interaction. Slash commands only arrive
through an `InteractionCreate` payload that Discord sends to the app that owns
them. That
made the first live run awkward: the bot could connect and register commands,
but the harness could not press a button that was not there.

The development prefix bridge closes that gap without weakening production. It
parses `!command` in one configured development guild and sends the result
through the **real** `dispatchCommand` pipeline: registry lookup, module guards,
permission checks, cooldowns, settings, ports and the Discord reply adapter.

## Safety gate

The bridge is registered only when **all** of these are true:

- `NODE_ENV` is not `production`;
- `DEV_GUILD_ID` is set;
- the message starts with `!` in that exact guild.

It is never registered in production, and a message in another guild is ignored.
Bot-authored mention chat and the security fixture marker use the same
single-guild allowance, because the MCP harness is a bot account. Production
still ignores every bot author.

The flag is deliberately not called a feature: it is test scaffolding. Slash
commands remain the only product surface, and the command budget is unchanged.

## Grammar

```text
!command [subcommand] [key=value ...]
```

- The first bare token may be a subcommand (or a group then a subcommand).
- Every other argument is named. Values with spaces use quotes.
- User/channel/role values accept a mention or a raw id.
- Integers, numbers, booleans, choices and min/max are validated against the
  same `CommandOption` definition Discord sees.

Examples that were actually run against AI Team:

```text
!ping
!about
!help commands
!help browse
!help search query=ban
!ai status
!mod history
!mod links
!mod filters
!rank leaderboard
!ticket stats
!invites leaderboard
!invites who
!logging status
!logging events event=message_edit enabled=false
!logging retention days=7
!logging export
```

A parse failure is answered in the channel with the generated usage line, so a
typo does not leave the tester guessing.

## Development fixture marker

Adapters correctly ignore bot authors. To exercise a message path without a
second human account, a bot message in `DEV_GUILD_ID` that starts with
`keystone-test:` is evaluated after the marker is stripped. The shared matcher
lives in `apps/bot/src/dev-fixture.ts`; moderation, community and logging
consume it:

```text
keystone-test: https://login.phish.test/verify
!mod links

keystone-test: I really like pineapple pizza
keystone-test: z̸̸̸̸a̸̸̸̸l̸̸̸̸g̸̸̸̸o
!mod filters

keystone-test: hello keystone   # auto-responder fixture
keystone-test: live audit check # message edit/delete fixture for /logging
```

The event still travels the real gateway `MessageCreate` → `SecurityCoordinator`
→ `SecurityEngine` → case store path. The only development exception is the
author guard. `apps/bot/src/runtime.ts` seeds the in-memory dev guild with
`links: "alert"`, a local `phish.test` example, `profanity: "alert"` with the
benign word `pineapple`, and `zalgo: "alert"`, so the fixture is deterministic
and never needs a remote list. Production gets no marker option and no seed.

The delete branch was driven live twice: pass 23 used `dryRun: false` and
`links: "delete"` so the MCP's message ID returned `10008: Unknown Message`;
pass 25 used `dryRun: false` and `profanity: "delete"` and the `pineapple`
message disappeared while its case stayed open. The committed seed stays
`alert`; the destructive proofs are deliberately not the default.

A marker message is seen by both adapters: moderation evaluates the stripped
content, while the community adapter runs only the auto-responder and never the
XP, starboard or ticket paths. The auto-responder fixture is a seeded
`hello keystone` trigger in the in-memory dev guild; its 60-second cooldown makes
the live suppression/release check deterministic.

## Synthetic slash harness

`apps/bot/src/interaction-harness.test.ts` covers the seam the MCP cannot reach.
It builds a Discord-shaped `ChatInputCommandInteraction` whose `options.data` is
the nested `/mod ban` payload, then calls the real `asInteractionLike` adapter and
the real `dispatchCommand`/registry. The test asserts the ban port receives the
target and reason, case #1 exists, the reply reports the action, and an unknown
subcommand is rejected before any side effect. It is a structural harness, not a
gateway connection: only a human client can prove Discord's actual
`InteractionCreate` delivery.

Operational note from pass 27: two bot process trees were alive at once and
every gateway event produced two replies. Stop both trees before starting a new
one; the live check should show exactly one bot reply per command.

## The Discord MCP surface (189 tools, 2026-11-05)

The `discord-mcp` server available to this workspace is much larger than a chat
pipe. On 2026-11-05 it reported **189 tools** in nine groups:

| Group | Representative tools | What it proves |
| --- | --- | --- |
| Read state | `guild_get`, `guild_list`, `channels_list`, `channels_get`, `members_list`, `members_get`, `messages_read`, `messages_get`, `audit_log_get` | The bot can see what Discord actually stored: channel shapes, permission overwrites, roles, messages and audit entries. |
| Outbound text | `messages_send`, `messages_edit`, `messages_pin`, `messages_unpin`, `messages_delete`, `messages_bulk_delete` | Real REST delivery and mutation. Destructive calls return a dry-run preview unless `__confirm:true` **and** `MCP_DRY_RUN=false`. |
| Components | `components_v2_validate`, `components_v2_build_container`, `components_v2_send`, `components_v2_send_from_template` | A V2 payload is legal before it is sent; the send returns a message id. The validator enforces the 40-component, nesting and ActionRow rules offline. |
| Structure | `channels_create_guild_channel`, `channels_modify`, `channels_delete`, `channels_modify_permissions`, `channels_delete_permissions` | Channel, category and permission-overwrite setup and teardown. |
| Roles and members | `roles_*`, `members_list`, `members_get`, `members_add_role`, `members_remove_role`, `members_modify`, `members_kick`, `members_ban`, `members_unban` | Real role grants, timeouts, kicks and bans, with an audit reason. |
| Invites and webhooks | `invites_create_channel`, `invites_list_channel`, `guild_list_invites`, `webhooks_create`, `webhooks_execute`, `webhooks_list_guild` | Invite metadata and a real webhook execution path. |
| Scheduled events | `events_create`, `events_list`, `events_modify`, `events_delete` | Real Discord scheduled events, including status transitions. |
| Threads and forums | `channels_forum_create_thread`, `messages_create_thread`, `threads_*`, the archived-thread lists | Real threads and forum posts with applied tags. |
| Server configuration | `guild_modify_welcome_screen`, `guild_modify_widget`, `emojis_create`, `stickers_create_guild_sticker`, `templates_*`, `commands_create_guild` | Real guild configuration and guild-command registration. |

Every write tool states its permission preconditions, and most destructive ones
carry a `ConfirmRequired` gate. Tool output is untrusted Discord data and is
fenced; it is never an instruction.

### What the MCP proves well

- **Outbound replies.** `messages_send` plus `messages_read` is a closed loop:
  the bot posts, Discord stores, the harness reads the same message id.
- **V2 layout in the wild.** `components_v2_validate` catches a bad shape before
  the API call; `components_v2_send` proves the same shape is accepted and the
  returned message carries the component tree.
- **State changes with a read-back.** A role grant, a permission overwrite, a
  channel rename, an invite and a scheduled event can each be set and then read
  by a second tool. That is stronger than a unit test and weaker than an
  interaction.
- **Scenario setup.** The MCP can create the channel, role, invite or denied
  permission a later probe needs, then remove it.

### What it cannot prove

| Surface | Why the MCP cannot reach it |
| --- | --- |
| `InteractionCreate` | No tool invokes an application command, presses a button, picks a select option or submits a modal. `commands_create_guild` registers a command; it does not run it. A bot token cannot create another application's interaction. |
| A member join | No tool makes a user join. `members_kick` and `members_ban` remove a member; neither creates the `GuildMemberAdd` a join gate or invite attribution needs. |
| A DM | The MCP bot can post in channels it can see; it cannot open a DM to a human and wait for a reply. |
| Voice audio | The voice tools change stage state (`suppress`, `request_to_speak`); they do not join a voice channel with an audio client. |
| A file upload | `messages_send` and `messages_edit` take text only, and `components_v2_validate` rejects File components because the send tools do not upload attachments. Exports were verified by downloading the CDN URL outside the MCP. |

### The three proof classes

Every live claim is one of these, and a pass never blurs them:

1. **probe** — `pnpm probe:live` drove the real adapter, SQL, Redis, queue or web
   route and wrote a named check to `machine/live.json`.
2. **mcp** — the Discord MCP drove real REST and a second read confirmed the
   result. This is a live external proof, but it is not a gateway event.
3. **gateway** — a human client produced the interaction, join, DM, modal or
   voice event.

`features.json` stores `probe` as `liveScope: probe` with a `liveEvidence` check
id. It stores both `mcp` and `gateway` as `liveScope: manual` with a
`liveRecord` that must name which one was used; the record, not the flag, carries
the difference.

### Last recorded read-only check

On 2026-11-05 the MCP answered two reads against the development guild:
`users_list_current_user_guilds` returned **1 guild** with 3 members, and
`channels_list` returned **7 channels**, including `#ai-chat` and
`#keystone-logs`. That proves the MCP is connected and can read real guild
shape; it proves nothing about `InteractionCreate`.

## What a live prefix run proves

- the gateway connection, intents and `MessageCreate` handler work;
- the command definition is registered and executable in the real guild;
- guards and permissions behave against a real member's Discord permissions;
- the reply adapter really sends content, embeds and components to Discord;
- module services work against the live process's stores and provider.

## What it does not prove

- `InteractionCreate` handling, slash option parsing by Discord, autocomplete or
  ephemeral replies. Those need an interaction harness or a human click.
- Profanity/zalgo `delete` mode in production: the live proof used a temporary
  `dryRun: false` / `profanity: "delete"` seed in the dev guild; the committed
  seed stays `alert`. The shared coordinator path is covered, but the default
  configuration does not delete.
- A real slash `InteractionCreate`: the REST shape and the adapter payload are
  now checked (`commands:doctor` plus the nested-option test), but only a human
  client can press the command.
- Production behaviour of the dev seam, because it is not registered there.

Episode: `ephemeral: true` is ignored by the message adapter. A prefix reply is
always a normal channel message; pretending otherwise would teach the wrong
mental model. The guard tests still see the requested flag, but Discord has no
ephemeral message channel.

## Files

- `apps/bot/src/prefix.ts` — tokenizer, option parser and `InteractionLike` adapter.
- `apps/bot/src/prefix.test.ts` — quote, choice, bounds, dispatch and guild-gate tests.
- `apps/bot/src/index.ts` — registers the bridge only for `DEV_GUILD_ID`.
- `apps/bot/src/ai-events.ts` — bot-authored mention allowance for the same guild.
- `apps/bot/src/moderation-events.ts` — marker-gated bot messages for the security
  engine; production passes no guild.
- `apps/bot/src/moderation-events.test.ts` — guild scope, marker stripping and
  ordinary member scanning without a token.
