# Events — spec

## What it is

Guild events with a lifecycle, a capacity-checked RSVP list, interactive
buttons, one automatic reminder and a portable JSON/ICS export. One root,
`/event`, with seven subcommands. The module is the eleventh and follows the
same contract as forms: one kernel port, one service that owns the state
machine, an in-memory adapter for tests and a Drizzle adapter for Postgres.

The RSVP panel posts when an event becomes `open`; its signed Going and Not
going buttons call the same `EventService.rsvp` as the command. One reminder is
sent by the existing 60-second community tick, not a second scheduler. It does
**not** send DMs, offer a `maybe` answer, or apply per-member timezones. Those
are named as open, not imitated.

## Commands

| Subcommand | Who | Options | Behaviour |
| --- | --- | --- | --- |
| `/event create` | `ManageGuild` | `name`, `key`, `description`, `starts`, `ends`, `location`, `capacity` | Writes a `draft`. `capacity` 0 or absent means unlimited. |
| `/event edit` | `ManageGuild` | `event`, `name`, `description`, `starts`, `ends`, `location`, `capacity`, `state` | Changes details and moves draft/open/closed. Moving into `open` posts the RSVP panel and records its channel. No options prints the current row. |
| `/event delete` | `ManageGuild` | `event`, `confirm` | Deletes only an event with no RSVPs; `confirm` must equal the key. |
| `/event list` | everyone | — | Lists events with state, start, going/capacity and not-going counts. |
| `/event rsvp` | everyone | `event`, `rsvp` (`going` / `not_going`) | Writes the **invoking member's** row. One row per member; changing the answer updates it. |
| `/event remind` | `ManageGuild` | `event` | Posts a manual reminder panel for an open event and records who sent it, when, and how many times. |
| `/event export` | `ManageGuild` | `event` | Attaches `keystone.events` JSON (events, RSVPs, counts, SHA-256 checksum) and an `.ics` serialized from that same payload. |

## State machine

```text
create ──▶ draft ──▶ open ──▶ closed
             ▲         │         │
             └─────────┴─────────┘   (edit can move between the three)
```

| Event state | New RSVP | Change RSVP | Remind | Delete |
| --- | --- | --- | --- | --- |
| `draft` | refused | refused | refused | allowed when no RSVPs |
| `open` | allowed | allowed | allowed | allowed when no RSVPs |
| `closed` | refused | refused | refused | allowed when no RSVPs |

RSVPs that already exist stay readable in every state; closing archives the
event, it does not erase attendance.

## Invariants

1. **One RSVP row per member per event.** A unique index on
   `(event_id, user_id)` is the structural rule. Neither the command nor a
   button has a `user` option or payload, so a member can only write their own
   row.
2. **The button is not a second write path.** Both panel handlers call
   `EventService.rsvp`, so capacity, the open-state gate and ownership are the
   same rules a moderator cannot bypass.
3. **Capacity counts `going` rows only.** `not_going` is a real answer, kept so
   a reminder can report it and so a decline frees a seat.
4. **Capacity is atomic.** The SQL adapter locks the event row and counts
   `going` rows inside the same transaction as the write, so two members racing
   for the last seat cannot both win. The service pre-check only produces the
   nicer refusal.
5. **History is not deleted.** `delete` refuses once any RSVP exists and points
   at `state:closed`.
6. **One automatic reminder, claimed.** The community tick calls
   `claimReminder`, a conditional update that only an open, never-reminded row
   can win; a failed post releases the claim. There is no event queue and no
   second interval.
7. **The calendar is derived.** `buildEventCalendar` takes the exact
   `EventExport` payload; it never reads the store again, so the JSON and `.ics`
   cannot disagree.

## Tables

`events` owns the lifecycle; `event_rsvps` owns membership.

- `events`: `(guild_id, key)` unique, state, `starts_at`, optional `ends_at`,
  location, nullable capacity, `panel_channel_id` (migration 0021), reminder
  columns.
- `event_rsvps`: `(event_id, user_id)` unique, `state`, cascade delete from the
  event.

A table is required rather than a settings blob or `community_records`: the
uniqueness rule, the capacity count and the cascade all need real SQL, and a
cached counter would drift.

## Limits

- One global command root. `pnpm budget` reports **20/100 roots · 141
  subcommands · 167 actions · 4 context menus**.
- No new dependency, no privileged intent, no paid service.
- Event cap 25, RSVP cap 500 per event by default, both in module settings.

## Partial and open

- **Per-member timezones and repeat reminders** are not built. The lead is one
  guild setting, and an event gets at most one automatic reminder.
- **A `maybe` answer** is not built. The panel and command both offer two
  states so capacity stays unambiguous.
- **A real calendar consumer** is not exercised. The `.ics` is serializer- and
  adapter-tested, not imported by a calendar application.
- **A live button press or automatic delivery** is not claimed;
  `InteractionCreate` is outside the MCP surface and the delivery is tested
  through a fake channel.
- **No DM when an event opens.** It would need a delivery port; borrowing
  another module's adapter is the coupling pass 39 removed.

## Evidence

- `modules/events/src/events.test.ts` — parsing, the full flow, ownership,
  capacity, closed/draft refusals, delete rules, permissions, settings, the
  panel and the ICS serializer.
- `apps/bot/src/components.test.ts` — the signed router path for both buttons:
  write, full refusal, decline releasing a seat, expired/cross-guild/closed.
- `apps/bot/src/event-reminders.test.ts` — one post from the tick, idempotence,
  the disabled module and claim release on a failed send.
- `packages/db/src/event-store.test.ts` — PGlite: unique key, one RSVP row,
  capacity and seat release, reminder bookkeeping, cascade delete, panel
  channel, one winner from two claims.
- `memory/journal/2026-11-01-pass-41.md` — live bridge transcript and the
  downloaded JSON export cross-check.
- `memory/journal/2026-11-05-pass-73.md` — this surface's design and tests.
