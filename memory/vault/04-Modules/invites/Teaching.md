# Invites — teaching notes

## Read in this order

1. `packages/kernel/src/invites.ts` — the port: join input, leaderboard row,
   store and one notification action.
2. `modules/invites/src/invites.ts` — `attributeInvite`, `suspiciousReasons` and
   `InviteService`. This is the whole policy, and it is pure or near-pure.
3. `modules/invites/src/commands/invites.ts` — a read-only command with guards.
4. `apps/bot/src/invite-events.ts` — the cache, the per-guild serialization and
   the gateway translation.
5. `packages/db/src/invite-store.ts` — SQL aggregation and the unique join key.

## The idea to take away

**Discord gives you a counter, not an answer.** There is no "member X used invite
Y" event. The platform tells you that *some* invite's `uses` went from 4 to 5.
Turning that into attribution is a diff, and a diff has two failure modes:
a repeated delivery (fix: a unique join key) and two joins racing (fix: serialize
per guild). Neither fix belongs in the command; both belong beside the diff.

The second idea is **advisory evidence**. A new account without an avatar is
suspicious and also completely ordinary. The module records why it is suspicious
and stops there. Moderation has its own dry-run-first policy; invites must not
quietly become a second punishment path.

## Exercise

Add a `joinedThenLeftWithinHours` flag for joins that leave within a configured
window.

1. Add `flagLeaveWithinHours` to `inviteSettingsSchema` (default `0` = off).
2. Decide where the calculation belongs. `recordLeave` currently only knows the
   guild and member; you will need the newest open join's `joinedAt`. Keep the
   rule in `suspiciousReasons` or add a focused function — do not put it in the
   Discord adapter.
3. Update the PGlite test so the flag is visible after a leave.
4. Run `pnpm vitest run modules/invites packages/db/src/invite-store.test.ts`.

## The mistake you will probably make

Diffing invites on every `GuildMemberAdd` without a per-guild queue. It passes
the single-join test and double-attributes as soon as two people join together.
Write the two-join test first; the production fix (a promise chain per guild) is
small, but only if you know why it is there.

The second mistake is treating `invite.uses` as owned by Keystone. It is a
Discord counter that also moves for invites created by other bots and for
integrations. Never assume your cache is complete; an unchanged diff is a valid
answer and should produce a row with no inviter, not an exception.

## Stretch

Replace the process-local cache with durable snapshots in `invite_joins` (or a
small `invite_codes` table) and prove that a restart between two joins does not
lose an attribution. Explain in [[Status]] why the extra table is worth it, and
what it costs in writes per join.
