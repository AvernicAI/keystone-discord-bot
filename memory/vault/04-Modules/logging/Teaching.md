# Audit logging — teaching notes

## Read in this order

1. `packages/kernel/src/logging.ts` — the five event kinds, the record shape, the
   store port and the one delivery action. No Discord types appear here.
2. `modules/logging/src/events.ts` — the single event table. Settings keys,
   command choices, labels, colours and the embed formatter all read it.
3. `modules/logging/src/service.ts` — ordering and policy: disabled, event-off,
   append, deliver, keep the row on failure.
4. `modules/logging/src/format.ts` — one formatter for live delivery and export.
5. `modules/logging/src/commands/logging.ts` — seven subcommands, one root.
6. `packages/db/src/logging-store.ts` — the append-only SQL adapter and the
   indexed prune.
7. `apps/bot/src/logging-events.ts` — gateway translation only. If policy starts
   appearing here, it belongs in the service.
8. `apps/bot/src/logging-actions.ts` — the Discord send, including
   `allowedMentions: { parse: [] }`.

## The idea to take away

**Store first, deliver second.** A log channel is an output, not the record. If
the channel is deleted, the bot loses permission or Discord returns 500, the
audit trail must still exist. That is why `record()` calls `store.append()` before
it calls `actions.send()`, and why `store.append()` is the only operation allowed
to fail the event. Delivery returns `{ ok: false }`; it does not throw into a
gateway listener.

The second idea is **one event table**. Adding a sixth event means one entry in
`events.ts` plus one adapter translation. There is no second switch in the
settings schema, the command choices or the renderer. If those three drift, a
toggle exists that no embed honours.

## Exercise

Add a `role_update` event.

1. Add the kind to `LOG_EVENT_KINDS` in the kernel and a settings key to
   `loggingSettingsSchema`.
2. Add one entry to `LOG_EVENTS` with a colour and description.
3. Render it in `logEmbed` with the fields a role change needs, and keep the
   fallback branch reachable.
4. Translate `Events.GuildRoleUpdate` in `logging-events.ts` with a structural
   fixture, including a bot-authored case if you intend to test it live.
5. Run `pnpm vitest run modules/logging apps/bot/src/logging-events.test.ts`.

You should not need to edit the command file: the choices and the toggle come
from the event table.

## The mistake you will probably make

Putting the Discord send inside the gateway listener. It looks simpler and it
passes a single-event test, but the listener then owns retries, channel
resolution, permission errors and embed construction. When the channel is
deleted, the exception either crashes the listener or is swallowed and the event
is lost before it is ever stored.

The second mistake is storing message content for every event "just in case".
Discord deletes a message before the bot can fetch it, so delete and edit are the
only kinds that need the content; member events and moderation cases already
carry the data a human needs. A blanket content store turns a logging feature
into a message archive with a different privacy promise. The spec and retention
page say exactly what is kept, and the code should match them.

The third mistake is making the log channel a second moderation path. A
moderation case is recorded by the case service and *observed* here. Logging must
never ban, delete or close anything; it is evidence, not action.

## Stretch

Use the same ledger for `/analytics`: count events per kind per day in SQL rather
than loading rows, and prove that pruning a guild changes its series. Explain why
the aggregate reads `logging_events` instead of adding a second counter table,
and what happens to an event that was stored while delivery was failing.
