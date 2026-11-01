# Live testing without slash invocation

## Why this exists

An external Discord MCP, or any other bot, can post and read messages but cannot
invoke an application command. Slash commands only arrive through an
`InteractionCreate` payload that Discord sends to the app that owns them. That
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
Bot-authored mention chat uses the same single-guild allowance, because the MCP
harness is a bot account. Production still ignores every bot author.

The flag is deliberately not called a feature: it is test scaffolding. Slash
commands remain the only product surface, and the command budget is unchanged.

## Grammar

```text
!command [action] [key=value ...]
```

- The first bare token may be the command's `action` choice.
- Every other argument is named. Values with spaces use quotes.
- User/channel/role values accept a mention or a raw id.
- Integers, numbers, booleans, choices and min/max are validated against the
  same `CommandOption` definition Discord sees.

Examples that were actually run against AI Team:

```text
!ping
!about
!ai status
!mod history
!rank leaderboard
!ticket stats
!invites leaderboard
!invites who
```

A parse failure is answered in the channel with the generated usage line, so a
typo does not leave the tester guessing.

## What a live prefix run proves

- the gateway connection, intents and `MessageCreate` handler work;
- the command definition is registered and executable in the real guild;
- guards and permissions behave against a real member's Discord permissions;
- the reply adapter really sends content, embeds and components to Discord;
- module services work against the live process's stores and provider.

## What it does not prove

- `InteractionCreate` handling, slash option parsing by Discord, autocomplete or
  ephemeral replies. Those need an interaction harness or a human click.
- Application-command registration beyond the REST response already observed in
  the ready log.
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
