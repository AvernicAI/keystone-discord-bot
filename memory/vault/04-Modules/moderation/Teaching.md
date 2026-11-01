# Moderation & security — teaching notes

## Read in this order

1. `modules/moderation/src/security.ts` — the event → finding engine and the
   coordinator that persists before it acts.
2. `modules/moderation/src/cases.ts` — `CaseService`, the append-only event
   model, and why an appeal is a new event.
3. `modules/moderation/src/commands/mod.ts` — one hub command, dry-run gate,
   case-before-action ordering.
4. `packages/db/src/case-store.ts` + `migrations/0003-case-counters.ts` — the
   atomic case-number allocation.
5. `apps/bot/src/moderation-actions.ts` — permission prechecks and the only file
   that turns a case action into a Discord call.
6. `apps/bot/src/moderation-events.ts` — the gateway-to-structural-event seam.

## The idea to take away

**Alert-only is a safety property, not a missing feature.** The default settings
have `dryRun: true`; the engine still creates an `alerted` case and posts the
evidence, but the coordinator never calls a punitive action. A stranger can
install Keystone, watch a raid, and decide the rules fit before giving it the
power to remove anyone.

The second idea is **case before action**. `runAction` and the security
coordinator open the case and append `created` first. If Discord returns 403,
the case remains open with a failure note in the review queue. An external call
can fail; the accountability record cannot disappear with it.

The third is **event sourcing**. `case_events` is append-only. A reversal is a
new event and a state transition, never an edit to the original reason. That is
what makes an appeal defensible later.

## Exercise

Add an `appeal` rate limit and a `case export` action.

1. Add `appealCooldownMs` to `moderationSettingsSchema` with a default and a
   test that a second appeal within the window is rejected.
2. Use the injected `ctx.cooldowns` port rather than a module-local Map.
3. Add `/mod export` that returns JSON only for a moderator with
   `ModerateMembers`; include cases and events, never another guild's rows.
4. Explain in [[Status]] why export belongs to the case service, not the command.

## The mistake you will probably make

Calling `actions.ban()` before `cases.open()`. It looks simpler, and in the happy
path it is. The first time Discord returns 403 or the member leaves, you have an
action with no record — exactly the failure the case model exists to prevent.

The second likely mistake is treating a JSON evidence blob as an archive. Keep
the trigger slice; do not start storing every message "just in case". The
retention table and the data-ownership promise are part of the design.

## Stretch

Replay the exact `security.test.ts` fixture through `registerModerationEvents`
with a fake discord.js client, so the adapter seam is covered without a token.
The event translator should remain dumb: no thresholds, no case creation, no
punishment decisions.
