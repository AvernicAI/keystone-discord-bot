# Curriculum

The repository is the course. Each lesson points at real code, asks you to change
something small, and names the check that proves the change.

## Who this is for

You can read TypeScript and have used Discord. You have never built a bot with
more than one file, or you have and it became unmaintainable.

## Lessons

The curriculum has **17 lessons**, all written against code that exists now.
Every lesson is listed in `memory/machine/lessons.json`; `pnpm memory:check`
verifies its source files, proof commands, required sections and Curriculum
link. A taught count must name a machine source, so the gate recomputes it. If a
lesson and the code disagree, the gate fails rather than the prose winning.

| # | Lesson | Code | You will learn |
| --- | --- | --- | --- |
| 1 | [[01-the-module-contract]] | `modules/diagnostics`, `packages/kernel` | Why folders beat switches; how dispatch works |
| 2 | [[02-guards-and-permissions]] | `packages/kernel/src/guards.ts`, `dispatch.ts` | Middleware, 403 avoidance, cooldowns |
| 3 | [[03-settings-that-cannot-corrupt]] | `packages/kernel/src/settings.ts`, module schemas | Schema-first config, defaults, reset |
| 4 | [[04-tests-without-a-token]] | `packages/testing`, `packages/kernel/src/testing.ts` | Structural fakes, PGlite, why purity pays |
| 5 | [[05-cases-and-evidence]] | `modules/moderation/src/cases.ts`, `packages/db/src/case-store.ts` | Append-only evidence, case numbers, atomic expiry claims |
| 6 | [[06-subcommands-and-the-budget]] | `packages/kernel/src/budget.ts`, `scripts/commands-catalog.ts` | Root versus subcommand, the 100-root cap, drift checks |
| 7 | [[07-jobs-and-idempotency]] | `packages/queue`, `apps/worker` | At-least-once delivery, retries, receipts |
| 8 | [[08-the-bot-side-timer]] | `apps/bot/src/timers.ts`, `modules/moderation/src/temporary.ts` | Why the timer is bot-side, conditional SQL claims, recovery |
| 9 | [[09-memory-that-checks-itself]] | `memory/tools`, `scripts/audit-claims.ts` | Machine truth, generated pages, evidence levels |
| 10 | [[10-the-live-window]] | `scripts/live-probe.ts`, `memory/machine/live.json` | PGlite versus Postgres, the probe, what “live” means |
| 11 | [[11-panic-mode]] | `modules/moderation/src/panic.ts`, `apps/bot/src/moderation-actions.ts` | Snapshot before acting, partial restore, idempotent switches |
| 12 | [[12-goodbye]] | `modules/community/src/engagement.ts`, `apps/bot/src/community-events.ts` | Reuse settings and services; omit branches that cannot work |
| 13 | [[13-portability-and-receipts]] | `packages/importer`, `packages/db/src/portability-store.ts` | Checksums, dry runs, transactional restore, rollback receipts |
| 14 | [[14-self-host-quickstart]] | `README.md`, `compose.yaml`, `Dockerfile` | Memory mode, compose, explicit migrations, the probe boundary |
| 15 | [[15-dashboard-as-a-product]] | `apps/web/src/shell.ts`, `directory.ts`, `readiness.ts` | One shell, audited toggles, computed readiness, read-only ports |
| 16 | [[16-one-player-not-two]] | `apps/bot/src/music/playback.ts`, `shoukaku-node.ts` | Transport, queue and presentation as three problems; row-is-queue; edit budgets |
| 17 | [[17-one-card-not-twelve-embeds]] | `modules/moderation/src/format.ts`, `apps/bot/src/adapt.ts`, `apps/web/src/settings-form.ts` | One builder per surface; the adapter owns the V2 flag; pickers read a port |

## Not written yet

The signed component ids and the 40/4,000 budget have no lesson of their own:
lesson 17 shows the builder and the flag boundary, and the budget is proven by
`packages/ui` tests rather than by a reader changing one thing. Sharding has no
lesson because the bot does not shard; writing one now would be a design essay
pretending to be a lesson. Both belong here when there is a runnable change and
a check to fail.

## Each lesson has the same shape

1. **The problem** — a concrete failure in a real bot.
2. **The naive version** — what most tutorials do, and why it stops working.
3. **Our version** — annotated source.
4. **The exercise** — a small change, with a failing check to guide you.
5. **What we rejected** — the alternative and the reason.

## Why "what we rejected" is not optional

Anyone can read final code and copy it. The expensive knowledge is why the other
obvious approaches were worse. That is what turns a reader into someone who can
make the next decision alone.

## Contributing a lesson

Add the lesson file, then add its `path`, `proofCommands` and source `files` to
`memory/machine/lessons.json`. Link it in the table above. Run:

```bash
pnpm memory:check
pnpm check
```

The gate checks the commands are real package scripts, the files exist, the
lesson has the required sections, and the Curriculum link is bidirectional. A
lesson that claims a repository count must name a `facts` source the gate can
recompute (`limit`, `contextMenuLimit`, `migrations`, `modules`, `roots`,
`subcommands`, `actions`, `contextMenus`, `liveChecks` or `lessons`); do not
type a number that no check owns.
