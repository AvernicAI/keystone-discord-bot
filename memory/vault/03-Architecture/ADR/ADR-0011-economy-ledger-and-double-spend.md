# ADR-0011 — Derived ledger balances and double-spend-safe economy

## Status

Accepted — P4 hardening, 2026-11-01.

## Context

The P3 community module already exposed `/rank balance`, `daily`, `pay`, `shop`,
`buy`, `gamble` and `ledger` over `economy_ledger`. The ledger is append-only and
balances are `SUM(amount)`, but the P3 transfer/buy/gamble paths read a balance
and then inserted, leaving a concurrent double-spend window. A retried
interaction also generated a new random UUID, so it could move money twice. There
was no bot-target refusal, and daily did not consult the kernel cooldown port.

The P4 approval asks for the economy surface to be ledger-backed, idempotent,
double-spend-safe, explicit about refusals, and server-side. It also asks us to
build on the existing seams rather than add a parallel module.

## Decision

1. **Balance is always derived** from `economy_ledger`; no mutable balance
   column is introduced.
2. Add `CommunityStore.spend(input): SpendResult` for checked debits. The store
   checks idempotency and funds inside the same serialized section as the insert.
3. Keep `CommunityStore.transfer` as the paired out/in operation. Postgres locks
   the guild row (`SELECT … FOR UPDATE`) before reading the balance; the in-memory
   store serializes money mutations through one queue. This removes the
   check-then-insert race for transfers and purchases.
4. Use the Discord interaction id as the idempotency key for transfers,
   purchases and gambles. `/rank` passes `ctx.interaction.id`; a retry is a
   duplicate, not a second movement. Daily keeps the UTC day key and additionally
   uses `CooldownStore` through `ctx.cooldowns`.
5. Refuse self-pay, bot targets, amounts above `economy.transferMax`, bets above
   `economy.gambleMax`, insufficient funds and an already-claimed daily with
   explicit `UserError` or result reasons. The store never silently clamps.
6. Shop/role purchases **grant directly**. The debit is committed before the
   Discord role call; if the role call fails, the command reports that the
   purchase was recorded and asks an admin to repair it. There is no moderator
   review queue in this pass.
7. Keep the existing `/rank` root. No new command, intent or dependency.
8. Keep ticket summaries on demand (`/ticket summary`). The plan's P4 text does
   not require an automatic summary on close; adding one would add an unbounded
   AI spend trigger to a lifecycle event. This is recorded rather than left
   ambiguous.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Cached `balances` column | Two truths drift; a failed projection is a support incident. The ledger is the audit source. |
| Command-level balance check | The P3 double-spend race: two concurrent calls read the same pre-spend sum. |
| `SELECT … FOR UPDATE` on the ledger sum | A sum has no single row to lock; locking a guild row is explicit and works for a new guild. |
| In-process mutex only | Correct for one process; not enough for two bot shards or a worker. The DB path needs the lock. |
| New `/economy` module/root | Duplicates `/rank`, spends a command and splits the model. The module contract already has a hub. |
| Review queue for role purchases | Adds moderator load and state the P4 plan did not fund; direct grant is documented. |
| Random UUID idempotency | A retried interaction becomes a second movement. |
| Negative balances / overdraft | Not requested, creates debt semantics and a support burden. |
| Automatic AI summary on close | Not in the P4 plan; would add a hidden provider call on every close. |
| Global economy | Explicit non-goal; server context is the product. |

## Consequences

- Every balance read is a sum; the `(guild_id, user_id)` index keeps it bounded.
- Concurrent transfers/spends serialize per guild. That is a deliberate
  throughput trade-off for correctness at community scale.
- A role grant can fail after the debit; the failure is explicit and the ledger
  shows the spend. An admin repair is the current path.
- PGlite exercises the same `FOR UPDATE` transaction path; a real Postgres server
  is still an external proof.
- No new command or paid dependency. The ledger remains exportable/deletable with
  the rest of the guild data.
