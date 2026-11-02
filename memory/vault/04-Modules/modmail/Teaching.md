# Modmail — teaching note

## Why two tables, not settings

Modmail looks like a channel configuration: enable it, pick a staff role, done.
But the product is the conversation. A thread has an owner, a lifecycle, an
append-only message log and a transcript that must survive closing. Those are
relational facts:

- "one active thread per member" is a uniqueness rule;
- "one message per row, in order" is a foreign key and a timestamp;
- "archive exactly once" is a conditional update whose `WHERE` clause is the
  guarantee.

A settings blob can store a list of messages, but it cannot enforce any of
those. The two tables are the smallest shape that makes the rules structural
instead of hopeful.

## Why the partial unique index

```sql
CREATE UNIQUE INDEX modmail_threads_active_owner_idx
  ON modmail_threads (guild_id, owner_id)
  WHERE state <> 'closed';
```

A plain unique index on `(guild_id, owner_id)` would let a member open exactly
one thread ever. The partial index says what the product means: one **active**
thread, and closing frees the slot. The in-memory store checks the same rule
before inserting; the index is the database backstop for a race, and
`createThread` catches the unique violation and returns the active thread so the
command can name it.

## Why the foreign refusal is the same as the missing one

The naive implementation says `That thread belongs to someone else.` That is a
privacy leak: it confirms the thread exists. The service returns the same
`Mail thread <id> was not found.` for both cases, so the command cannot be used
to enumerate other members' mail. Staff bypass the check explicitly, not by
guessing from the message.

Ownership is checked in one place, `ModmailService.#visible`, and every read and
write goes through it. Scattering `ownerId === userId` checks across six branches
is how one branch eventually forgets.

## Why ownership beats staff status

If a moderator opens a thread about their own role, should their replies be
"staff" messages? The module says no: the opener is always the member side, even
with `ManageGuild`. Otherwise "which side spoke" depends on who is typing, the
unread counters point the wrong way, and the transcript becomes ambiguous. Staff
status only grants access to **other** members' threads.

## Why the first staff reply claims

The plan's six names do not include `claim`, and adding a seventh would widen the
surface for one field. The first staff reply is the moment a human actually takes
the thread, so `appendMessage` records `claimed_by` and `claimed_at` in the same
transaction as the message. `open → claimed` has a real trigger, and another
staff member can still answer a claimed thread.

## Why closing is one conditional update

```text
build transcript from the messages
compute SHA-256 over the canonical JSON
UPDATE modmail_threads
   SET state = 'closed', transcript = ..., checksum = ...
 WHERE id = ? AND state <> 'closed'
```

If the row comes back, this caller archived it. If not, someone already did, and
the service says `already closed` without writing. Storing the transcript on the
thread row means there is no third table to keep in sync, and the archive is
visible to `transcript` immediately. The important part is not the column choice;
it is that the check and the write are the same statement.

## Why stats lists thread ids

The first draft of `/modmail stats` printed only counts. That looked complete and
was a dead end: `reply` and `transcript` need a thread id, and staff had no way
to learn one. `stats` now lists up to ten active threads with their ids and
unread counts — still the same subcommand, still reads real rows, but staff can
actually answer the queue. A dashboard of numbers that cannot be acted on is not
a feature.

## Why there is no DM relay

A real modmail bot watches DMs, creates a staff thread and relays both ways.
That needs a delivery port, a gateway message handler and a DM path the MCP bot
cannot prove. Shipping a relay that was never exercised would be worse than an
inbox that truthfully says "read it with `/modmail transcript`". The open note
names the missing half instead of hiding it behind a button.

## Mistakes this module is designed to avoid

- **A privacy check in the command.** Put it in one service method and route
  every branch through it.
- **A different refusal for "not yours".** That confirms existence.
- **A `user` option on `open` or `reply`.** The author is the interaction.
- **Deleting messages on close.** Close archives; history is not rewritten.
- **A second transcript on a retried close.** Conditional update, not read-then-write.
- **A stats page with no actionable ids.** Counts alone cannot be answered.

## What to read next

- `packages/kernel/src/modmail.ts` — the port, the typed results and the archive input.
- `modules/modmail/src/modmail.ts` — privacy, lifecycle, caps and the transcript.
- `modules/modmail/src/commands/modmail.ts` — the six branches and the staff boundary.
- `modules/modmail/src/store.ts` — the in-memory rules, one for one.
- `packages/db/src/modmail-store.ts` — the transaction, the claim and the conditional close.
- `packages/db/src/modmail-store.test.ts` — the raw-row proof that the archive is single.
