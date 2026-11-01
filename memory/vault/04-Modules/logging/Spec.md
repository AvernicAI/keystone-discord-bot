# Audit logging — spec

One operator-configured channel for message, member and moderation events, and
an append-only ledger behind it. Answers "what happened in this server, and can
I still read it after the Discord message is gone?".

## Purpose

Logging is a staple of Dyno and Carl-bot, and a common reason servers keep a
second bot. Keystone ships it as its own module so the same event stream can
feed `/analytics` and case review without a second collection path.

The module is deliberately **off until configured**. A fresh install must not
start storing deleted message content because a module happened to be present in
the registry.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/logging setup` | required `channel` | guild-only, `ManageGuild`, 2-second cooldown | Sends a test message, then enables logging with that destination. A channel the bot cannot post in is refused before any setting is written. |
| `/logging channel` | optional `channel` | same | Sets the destination. Omitting the option clears delivery but keeps the ledger and event toggles. |
| `/logging events` | optional `event`, optional `enabled` | same | With no `event`, lists every toggle. With an event and no `enabled`, reports that event. With both, turns that event on or off. |
| `/logging status` | — | same | Channel, event toggles, retention window and stored count. |
| `/logging retention` | required `days` (1–365) | same | Stores the window and prunes rows older than it immediately. |
| `/logging export` | — | same | Returns settings plus the ten newest stored events as JSON in an embed, trimming events until the JSON fits Discord's description limit and marking `truncated: true` if it had to. |
| `/logging disable` | — | same | Stops capture and delivery. Settings and existing rows remain until retention prunes them. |

There is no `/logs` or second root. The seven actions live under `/logging`.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `false` | Capture and deliver events |
| `channelId` | string? | unset | Log channel; `null` means store without delivery |
| `events.messageDelete` | boolean | `true` | Message deleted |
| `events.messageEdit` | boolean | `true` | Message edited |
| `events.memberJoin` | boolean | `true` | Member joined |
| `events.memberLeave` | boolean | `true` | Member left |
| `events.moderationAction` | boolean | `true` | A moderation case was opened |
| `retentionDays` | integer 1–365 | `30` | Rows older than this are pruned |

Settings go through the module's own Zod schema and the shared
`SettingsService`; the dashboard reads the same catalog. There is no logging-only
settings store.

## Event flow

```text
Discord gateway
  message delete / update ───────────────┐
  member join / leave ───────────────────┤
                                          ├─ apps/bot/src/logging-events.ts
CaseService.onOpened ──── LoggingService.recordCase() ── modules/logging/src/service.ts
                                          │
                    enabled & event on? ──┤ no → write nothing
                                          │ yes
                                    store.append()   (durable first)
                                          │
                              channel configured? ── no → stored, no delivery
                                          │ yes
                                 LoggingActions.send()
                                          │
                                failure → stored, delivery-failed
```

The ordering is the audit guarantee: the row is written before the Discord call.
A deleted channel, missing permission or adapter exception loses delivery, not
history. A moderation action is not allowed to fail because logging failed.

## Rendered events

Every event uses one formatter, so delivery and export agree:

- **Message deleted** — author, message id, channel and stored content (or
  `Content unavailable.` when the gateway supplied no content).
- **Message edited** — author, message id, channel, before and after.
- **Member joined** — mention, account age in days and bot flag.
- **Member left** — mention and join date.
- **Moderation case** — case number, action, reason, target, actor, rule and
  state.

Discord message embeds are sent with `allowedMentions: { parse: [] }`, so a
logged message cannot ping the channel from its stored content.

## Data

One append-only table, `logging_events`:

```text
id uuid, guild_id text, kind text, actor_id?, target_id?,
channel_id?, message_id?, summary text, data jsonb, created_at timestamptz
```

`created_at` is the event time, not the insert time, so retention is deterministic
when a queued event is replayed. `(guild_id, created_at)` is indexed for the
newest-first read and for one scoped `DELETE` during pruning. There is no update
path.

Message content is stored only for delete and edit events, because the Discord
message no longer exists to read later. The JSON export never includes a token or
any environment value.

## Retention

`days` defaults to 30. The service computes a cutoff from `now - days × 86,400,000`
and deletes only that guild's rows older than it. Pruning runs:

- immediately after `/logging retention`;
- once per guild at startup;
- every six hours while the bot is running.

Rows are never pruned by an unspecified background worker, so local memory mode
and a full Postgres deployment follow the same rule.

## Intents and permissions

- Required intents: `Guilds`, `GuildMessages`.
- Optional intents: `GuildMembers` (joins/leaves) and `MessageContent` (message
  content in delete/edit embeds). `/setup` names both fallbacks.
- Bot permissions: `ManageGuild` for the command guards; `ViewChannel`,
  `SendMessages` and `EmbedLinks` for delivery.

Without `MessageContent`, the event still records the author, ids and channel but
renders `Content unavailable.`. Without `GuildMembers`, member events never
arrive; message and moderation events continue.

## Non-goals

- A hosted log search UI. The JSON export and `/analytics` read the same rows;
  logging does not add a second query surface.
- Voice, role, channel or audit-log ingestion. Discord's audit log is a separate
  permission and API; only the five named event kinds are captured here.
- Guaranteed delivery. Delivery is best-effort by design; the ledger is the
  durable part.
- Cross-guild logs. Every row and query is guild-scoped.
- Storing content the gateway did not give the bot. A cache miss is an explicit
  `Content unavailable.`, not a fabricated message.

## Limits respected

- One new global root (`16/100` now that analytics, `/config` and `/export` have
  landed). Seven subcommands cost no extra slot.
- One indexed table and an append-only write per enabled event.
- Export is capped at ten events and trimmed to fit one embed.
- No paid service and no network call beyond Discord.

## Verified by

`modules/logging/src/logging.test.ts` (settings defaults, budget, service ordering,
delivery failures, toggles, case mapping, retention, embeds and every subcommand),
`apps/bot/src/logging-events.test.ts` (gateway translation, dev marker, edit
halves, member events and disposer), `packages/db/src/logging-store.test.ts`
(PGlite scoping, ordering, prune and restart) and the live transcript in
[[04-Modules/logging/Status|Status]].
