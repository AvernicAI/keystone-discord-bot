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
future scheduler should call the same write without pretending a message was
delivered, and a manual reminder should be visible in the row even if the reply
fails. There is no scheduler in this build, and the module does not claim one.

## What to read next

- `packages/kernel/src/events.ts` — the port and the typed create/RSVP results.
- `packages/db/src/event-store.ts` — the transaction and the capacity count.
- `modules/events/src/events.ts` — lifecycle, date parsing, caps and reminders.
- `modules/events/src/store.ts` — the in-memory equivalent, rule for rule.
- `packages/db/src/event-store.test.ts` — the PGlite proof that the unique index
  and the capacity check are real SQL, not just TypeScript.

## Mistakes this module is designed to avoid

- **A counter for capacity.** Count `going` rows at write time.
- **A second RSVP row after a change of mind.** Upsert on the unique key.
- **A delete that erases attendance.** Refuse delete once any RSVP exists.
- **A reminder that is only a message.** Record who, when and how many.
- **A placeholder subcommand.** Every branch either writes, reads or refuses
  with an accurate reason.
