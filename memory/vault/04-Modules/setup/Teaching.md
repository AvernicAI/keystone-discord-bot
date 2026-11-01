# Setup — teaching notes

## Read in this order

1. `modules/setup/src/commands/setup.ts` — a command that only reads.
2. `packages/kernel/src/types.ts` — `HealthProbe` and `HealthReport`, the two
   types the command depends on.
3. `apps/bot/src/runtime.ts` — where the real probe is built.
4. `packages/db/src/health.ts` — `SELECT 1`, then the migration ledger.

## The idea to take away

**Readiness is data, not prose.** The command does not contain a list of `if`
statements about environment variables. It asks a port, and the port returns a
structured report. That is why the same command works in a test with a fake
report and in production against Postgres.

The second idea is restraint: a first-run command that writes configuration can
leave a server half-configured when the third step fails. This one cannot.

## Exercise

Add a `Queue` field that reports whether a worker is sharing the queue.

You will need to:

1. Extend `HealthReport` in the kernel with a `queue` area — this is a contract
   change, so write a short ADR entry before the code.
2. Implement it in `RuntimeHealth` (`bot` mode: "in-process", "bullmq" with a
   reachability check).
3. Update `staticHealth()` so every existing test keeps compiling.
4. Add a test for both branches.
5. Run `pnpm check`.

Notice how many files the change touches: that is the cost of a port, and the
reason the plan says not to add one until a second implementation is plausible.

## The mistake you will probably make

Reading another module's settings to show "is leveling enabled?". That requires
the setup module to know the leveling module exists, and it breaks the rule that
modules do not reach into each other. If a future setup page needs cross-module
state, add a registry-level summary to the health port — not a second import.

## Stretch

Make `/setup` enqueue a `settings.snapshot` job and show its id, so an operator
can watch the trace in their collector. The job already exists in
`apps/worker/src/handlers.ts`; you would add the enqueue and a test asserting the
idempotency key, then explain in [[Status]] why a read-only command may have one
side effect.
