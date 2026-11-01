# Analytics — teaching notes

## Read in this order

1. `packages/kernel/src/analytics.ts` — the snapshot shape, the source ids and
   the one read port. Note that it imports nothing from Drizzle or discord.js.
2. `modules/analytics/src/commands/analytics.ts` — guards, the 1–90 day window,
   the default from settings, and one render map for six subcommands.
3. `modules/analytics/src/memory.ts` — the aggregation rules written in plain
   TypeScript: window filtering, distinct inviters, latency, ticket close time.
4. `packages/db/src/analytics-store.ts` — the same rules as SQL. Compare the two
   implementations; the snapshot test is what keeps them honest.
5. `packages/db/src/command-usage-store.ts` — one append-only write per command.
6. `packages/kernel/src/dispatch.ts` — where the write is made, after the result
   is known, and why a failure is only a warning.
7. `modules/analytics/src/format.ts` — the six views. A view is presentation;
   it never queries.

## The idea to take away

**Analytics is a query, not a collection.**

It is tempting to add an `analytics_events` table or a `command_count` column.
Both feel efficient, and both make the number unprovable: a missed increment is
invisible, and a second stream can disagree with the first. Keystone already
writes audit events, cases, invite joins, tickets and command usage as facts.
The snapshot reads those facts, and the command prints the source row count.

The second idea is **current state versus window state**. "There are 4 open
tickets right now" is not a seven-day count. The API type separates them, the
caption says which is which, and the test asserts both. Mixing them is how a
dashboard starts lying without any single query being wrong.

The third idea is **an observer must not be able to break the observed**. The
command usage write is best-effort. If the analytics table is down, the ban still
happens and the user still gets a reply. This is the same rule logging follows
when delivery fails after a row is stored.

## An exercise

Add `/analytics channels`.

1. Add a `channels` section to `AnalyticsSnapshot` and a query that groups
   `logging_events` by `channel_id` for the window.
2. Implement the same aggregation in `MemoryAnalyticsStore`.
3. Add a view function that renders the top ten channels, and map the
   subcommand to it in `analytics.ts`.
4. Add a test that seeds three channels and one row outside the window.
5. Run `pnpm vitest run modules/analytics packages/db/src/analytics-store.test.ts`.

You should not need a new table, a new event hook or a new root. If your change
needs any of those, stop and explain why the existing rows cannot answer the
question.

## The mistakes you will probably make

- **Counting the bot's own commands as user activity.** They are real rows, but
  they include the analytics command that is being run. That is why the current
  run appears only in the *next* call. Do not "fix" that by writing before the
  reply; you would record a failed command as `ok`.
- **Comparing ISO strings with `Date` semantics inconsistently.** The SQL store
  converts the window to `Date`; the memory store compares ISO strings. They
  agree only because both are UTC ISO-8601. Keep the boundary in one type and
  test it.
- **Treating `retained` as joins minus leaves over all time.** It is joins minus
  leaves *for rows in the window*. A join from last month whose member left
  yesterday must not reduce this week's retention.
- **Putting Discord sends in this module.** Analytics reads; it never posts to a
  log channel, DMs a member or mutates a case. If a view needs a channel name,
  resolve it in the adapter, not in the aggregate.
- **A chart over three rows.** A visualisation is not evidence. Start with exact
  counts and a source line; add history when there is history.

## Stretch

Wire `AnalyticsStore` behind the existing dashboard guild gate. Reuse
`GuildAccessService`; do not add a second auth check. Then add a PGlite test that
proves guild A's snapshot cannot contain guild B's rows even if the two data
sets are adjacent in time. Explain why the authorization belongs at the route,
while the `guildId` filter belongs in the store — and why you need both.
