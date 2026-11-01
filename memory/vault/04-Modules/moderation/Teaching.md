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

## The link filter, as a worked example

A detector should be a pure function before it is an event handler.
`suspiciousLink` takes message content and the local blocklist, and returns a
host plus a reason. It does not delete, log or write a case. That separation is
why the same function can be tested with four one-line fixtures and then driven
by a real gateway event.

Two details are worth copying into your own rules:

- **Normalise before comparing.** `new URL` lowercases the host, and the code
  removes `www.` and a trailing dot. A blocklist entry matches the host exactly
  or as a `.`-suffixed subdomain. Never use `includes`: `notphish.test` would
  otherwise match `phish.test`.
- **Keep the response a policy decision.** The detector returns the same finding
  whether the operator chose `alert` or `delete`; the mode decides the kind. The
  coordinator, case, appeal button and notification path are unchanged.

The list is local settings data, not a downloaded reputation feed. That keeps
the feature testable, private and free. The cost is that somebody has to maintain
the list, and punycode is a heuristic rather than proof.

## Profanity and zalgo, as a second worked example

The word filter is a small compiler lesson. `bannedWordMatch` first escapes each
operator-supplied word, then turns internal whitespace into `\s+`, then joins the
alternatives inside Unicode-aware edges. Escaping before compiling is what keeps
a word like `c++` from becoming a regex; the edges are what keep `ass` from
matching `class`.

The zalgo check is deliberately not a regex. It counts `\p{M}` code points and
compares the count with a threshold. That is easy to explain, easy to test, and
hard to fool with a long string of combining marks. It is still a heuristic:
some scripts use many marks legitimately, which is why the rule has its own mode
and threshold.

The default word list is empty. A bot should not ship somebody else's idea of
offensive; the operator owns the policy and can enable `alert` before `delete`.

## Exercise

Add an `appeal` rate limit and a `case export` action.

1. Add `appealCooldownMs` to `moderationSettingsSchema` with a default and a
   test that a second appeal within the window is rejected.
2. Use the injected `ctx.cooldowns` port rather than a module-local Map.
3. Add `/mod export` that returns JSON only for a moderator with
   `ModerateMembers`; include cases and events, never another guild's rows.
4. Explain in [[Status]] why export belongs to the case service, not the command.

## Link-filter exercise

1. Add `automod.linkAllowlist` and make a host that matches it win over the
   punycode check. Decide the order explicitly: allow-list, blocklist, heuristic.
2. Add a fixture with a userinfo trick (`https://phish.test@example.com`) and
   assert which host `new URL` reports. The answer is `example.com`; the part
   before `@` is not the host.
3. Keep the finding evidence to `{ host, match }`. If you are tempted to store
   the message, re-read the retention rule in [[Spec]].

## Word-filter exercise

1. Add an allow-list for the Scunthorpe problem and decide whether it wins over
   the blocklist. Write the order down before the test.
2. Add fixtures for `class`/`ass`, `pineapple`/`pineapples` and a phrase with
   three spaces. If a fixture is surprising, the rule is not documented enough.
3. Measure a 200-word list against a 2,000-character message. If compilation is
   visible in a profile, cache the compiled pattern instead of rebuilding it for
   every event; keep the cache keyed by the actual list, not the guild.

## The mistake you will probably make

Calling `actions.ban()` before `cases.open()`. It looks simpler, and in the happy
path it is. The first time Discord returns 403 or the member leaves, you have an
action with no record — exactly the failure the case model exists to prevent.

The second likely mistake is treating a JSON evidence blob as an archive. Keep
the trigger slice; do not start storing every message "just in case". The
retention table and the data-ownership promise are part of the design.

## Context menus are commands with a target

A message context menu is not a new subsystem. It is an application command of
type 3 that arrives with `targetId` (the message id), `targetMessage.author.id`
and — only when the MessageContent intent is granted — the message text. The
kernel models that as `commandType: "message"` plus `targetId`,
`targetUserId` and `targetContent`; the registry keys commands by
`type:name`, so a menu can share a display name with a slash root without
colliding.

Two design choices are worth copying. First, **Report message opens a case, it
does not delete the message**. A right-click is easy to misclick, and the case
is reviewable, appealable and durable; an accidental delete is not. Second,
**Case history reuses the same permission and the same rows as `/mod history`**.
If the menu had its own query or its own permission, the two surfaces would
drift and a leak would be invisible to the slash tests.

When MessageContent is off, do not guess. The report stores
`(content unavailable; MessageContent intent is off)` and keeps the message id,
which is the one fact a moderator can still act on.

## Stretch

Replay the exact `security.test.ts` fixture through `registerModerationEvents`
with a fake discord.js client, so the adapter seam is covered without a token.
The event translator should remain dumb: no thresholds, no case creation, no
punishment decisions.
