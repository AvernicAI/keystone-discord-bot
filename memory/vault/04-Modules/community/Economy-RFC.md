# RFC — ledger-backed economy (P4 hardening)

**Status:** accepted. **Date:** 2026-11-01. **Owner:** Community module.

## What it replaces

The economy surface replaces **MEE6**'s paid currency/daily/shop bundle and the
currency/gambling features admins use from **Carl-bot**. **Dyno** does not offer a
server economy (❌ in the matrix). The implementation stays on the existing
`/rank` hub; no bot has to choose between leveling and currency.

This is a hardening pass over the P3 `/rank` economy, not a second economy
module. The plan's P4 rows did not add a new economy root; duplicating the
surface would violate the "build on existing seams" rule and the command budget.

## Eight veto questions

| Specialist | Answer |
| --- | --- |
| Parity lead | Replaces MEE6 currency/daily/shop and Carl-bot currency/gambling. Balance, daily, pay, shop/buy, gamble and ledger are reachable from `/rank`; the named rows are in [[Parity-Matrix]]. |
| Platform engineer | Reuses `/rank`; total remains **10/100**. No new intent, component budget or gateway permission. One SQL transaction per money movement. |
| Trust & safety | Refusals are explicit: insufficient funds, self-pay, bot target, cap, cooldown. AI/automod cannot spend. Gambling is virtual currency, opt-in, capped; no real-money purchase. Role purchase is direct, with a clear failure message if Discord refuses the grant. |
| Data engineer | `economy_ledger` is append-only; balance is `SUM(amount)`. There is no cached balance column to drift. Unique idempotency keys and a guild-row transaction lock prevent duplicates/overspend. Export/delete follow the existing ledger retention. |
| UX / components | Existing `/rank` actions, no new command. Replies are ephemeral where they expose a budget or refusal. No extra component rows. |
| Teaching lead | The read order is `progress.ts` → kernel `CommunityStore` → `DrizzleCommunityStore`; the exercise asks a learner to reproduce a concurrent transfer and watch the lock. |
| Ops | No hosted dependency. Postgres uses a guild row lock; the in-memory store serializes through one queue. PGlite runs the same transaction path. Redis cooldowns remain optional. |
| Legal / open source | Free; no paid service, no real-money gambling, no third-party API. Virtual currency has no cash value. |

## Options considered

1. **Derived balance from the ledger (chosen).** One source of truth, replayable,
   exportable, no drift. Cost is a `SUM`; the guild index keeps it bounded.
2. **Cached balance column + ledger.** Faster reads, but two truths to reconcile;
   a failed projection becomes a support incident. Rejected.
3. **Check balance in the command, then insert.** Simple, but two concurrent
   transfers both see the old balance. Rejected after the double-spend test.
4. **Atomic `spend`/`transfer` in the store (chosen).** The store owns the
   conditional debit and the paired transfer; a guild row lock serializes writers.
5. **A new `/economy` root.** Rejected: duplicates `/rank`, spends a command and
   splits the user's mental model.
6. **Direct role grant for shop items (chosen).** Immediate, understandable, no
   moderator queue. The role call can fail; the failure is explicit and the ledger
   remains auditable. A review queue is a future option, not silently implied.
7. **Review-before-role.** Safer for expensive roles, but adds a queue, a state
   machine and moderator load the P4 plan did not fund. Rejected for now.
8. **Random UUID for every retry.** A retried interaction could move money twice.
   The stable Discord interaction id is now the idempotency key.

## Decision

Adopt option 1 + 4 + 6 with the kernel cooldown port for daily and stable
interaction ids for transfers/purchases/gambles. The full reasoning and rejected
alternatives are in [[ADR-0011-economy-ledger-and-double-spend]].
