# Live testing without slash invocation

## Why this exists

An external Discord MCP, or any other bot, can post and read messages but cannot
invoke an application command. The SaseQ `discord-mcp` tool list has no
application-command method; its **Use Slash Command** install permission is a
permission for that account inside the Discord client, not an API. A bot token
cannot create another application's interaction. Slash commands only arrive
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
```

A parse failure is answered in the channel with the generated usage line, so a
typo does not leave the tester guessing.

## Development fixture marker

Adapters correctly ignore bot authors. To exercise a message path without a
second human account, a bot message in `DEV_GUILD_ID` that starts with
`keystone-test:` is evaluated after the marker is stripped. The shared matcher
lives in `apps/bot/src/dev-fixture.ts`; moderation and community consume it:

```text
keystone-test: https://login.phish.test/verify
!mod links

keystone-test: I really like pineapple pizza
keystone-test: z̸̸̸̸a̸̸̸̸l̸̸̸̸g̸̸̸̸o
!mod filters

keystone-test: hello keystone   # auto-responder fixture
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
