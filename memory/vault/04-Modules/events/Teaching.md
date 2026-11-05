# Events — teaching note

## Why a table, not a settings key

An event looks like configuration: a name, a time, a place. But an RSVP is
member state that points at **one specific event**. If events lived in settings,
`/event rsvp event:launch-night` would have to resolve a name against a JSON
array, and renaming or deleting the event would silently orphan attendance. A
stable `events.id` makes the RSVP reference real, and the foreign key lets a
deliberate delete cascade.

The second reason is capacity. `capacity` is a rule about a count, and the count
must be read at the moment of the write. A cached `going` number in a settings
blob drifts the first time two members click at once. Counting rows is slower
and correct; the alternative is correct-looking and wrong.

## Why the capacity check lives in the store

The service could count `going` rows and then write, and it does — but only to
produce a nicer refusal. The authoritative check is inside the store's
transaction:

```text
lock the event row
count going rows
if full, return { ok: false, reason: "full" }
upsert the member's row
```

Locking the event row serializes concurrent RSVPs for that event without
serializing the whole table. This is the same shape the music queue uses for its
track cap: a write that depends on a count must read the count where the write
happens.

The in-memory store does the same check in one synchronous section, which is the
local equivalent of the transaction.

## Why RSVP has no user option

`/event rsvp` reads the member id from the interaction, never from an option.
That single decision is the ownership rule:

- no command path can write another member's row;
- a moderator cannot quietly mark someone as attending;
- the unique `(event_id, user_id)` index is the structural backstop, not the
  only guard.

`remind` is the only management-side write, and it never touches RSVP rows. If a
future feature needs "add a guest", it should be a separate, explicit command
with its own audit trail, not a `user` option bolted onto `rsvp`.

## Why `not_going` is a row, not a delete

Deleting a decline would make "who said no?" unanswerable and make counts
ambiguous. Keeping `not_going` costs one row and buys a real answer: a reminder
can report going and not-going, and a member who declines and later changes
their mind updates the same row. The capacity count only looks at `going`, so a
decline frees a seat without losing the record.

## Reminders: bookkeeping vs delivery

`EventService.remind` records `reminded_at`, `reminded_by` and increments
`reminder_count`. The command posts the message. That split matters because a
scheduler should call the same write without pretending a message was
delivered, and a manual reminder should be visible in the row even if the reply
fails.

Pass 73 supplies that scheduler, and it is not a scheduler. The community
module already runs a 60-second tick for giveaways, birthdays and feeds. The
reminder is a sweep inside that tick, reading `starts_at`, the guild's
`reminderLeadMinutes` and `reminded_at`. A restart therefore cannot lose a
timer: there was never an in-memory timer to lose.

`claimReminder` is the concurrency answer, and it is a database statement, not
a boolean in the process:

```text
UPDATE events SET reminded_at = ..., reminder_count = reminder_count + 1
WHERE id = ... AND state = 'open' AND reminded_at IS NULL
RETURNING *
```

Two overlapping ticks both issue it; exactly one gets a row. The loser skips.
If the channel send fails, `releaseReminder` undoes the claim so the next tick
retries instead of consuming the reminder silently. This is the same shape as
the music queue's track cap and the temporary-moderation claim: a decision that
depends on current state must be made where the write happens.

## The panel is a view, never an authority

A button feels like a new command, but it must not become a second rulebook.
`buildEventPanel` only mints ids and copy; `apps/bot/src/event-interactions.ts`
parses the guild settings and calls `EventService.rsvp` — the same method the
slash command calls. If someone later adds “buttons may bypass the cap”, it will
have to happen inside the service, where the command is also affected, rather
than in a route nobody tests against the command.

The id carries only the event id, never the member. The member is the
interaction's author. An id copied into another member's client would still
write the presser's row, and the signature stops a forged event id; the guild
gate stops a cross-server press. The expiry is a long one — a pinned
announcement lives for the event, not fifteen minutes — because the event's
state is the real gate, and a closed event disables the buttons as well.

## Why the calendar is a serializer, not a report

The `.ics` builder takes the `EventExport` payload the JSON writer already
built. It does not touch the store. That is deliberate: two reads in one
command can land on opposite sides of an RSVP write, so the calendar and the
JSON could disagree about who is coming. One read, two renderings.

RFC 5545 is fussy in ways that are easy to miss: backslash must be escaped
before semicolons or the new escapes are doubled; folding is at 75 **octets**,
not characters, so German text and emoji split earlier than they look; a
continuation line begins with one space, which counts toward the limit. The
serializer has tests for each, because a calendar that one client accepts and
another silently truncates is worse than no calendar.

## What to read next

- `packages/kernel/src/events.ts` — the port, the reminder methods and the
  scheduled-actor sentinel.
- `packages/db/src/event-store.ts` — the transaction, the capacity count and the
  conditional claim.
- `modules/events/src/events.ts` — lifecycle, date parsing, caps and reminders.
- `modules/events/src/panel.ts` — the one panel both the command and the tick
  post.
- `modules/events/src/reminders.ts` — the sweep and why there is no timer.
- `modules/events/src/ics.ts` — the RFC 5545 serializer.
- `modules/events/src/store.ts` — the in-memory equivalent, rule for rule.
- `packages/db/src/event-store.test.ts` — the PGlite proof that the unique index,
  the capacity check and the claim are real SQL, not just TypeScript.

## Mistakes this module is designed to avoid

- **A counter for capacity.** Count `going` rows at write time.
- **A second RSVP row after a change of mind.** Upsert on the unique key.
- **A delete that erases attendance.** Refuse delete once any RSVP exists.
- **A reminder that is only a message.** Record who, when and how many.
- **A second scheduler.** Reuse the tick that already runs.
- **A reminder without an audience.** Record the panel channel on the event row.
- **A button with its own rules.** Call the service the command calls.
- **A calendar that reads the database again.** Serialize the payload you were
  given.
- **A placeholder subcommand.** Every branch either writes, reads or refuses
  with an accurate reason.
