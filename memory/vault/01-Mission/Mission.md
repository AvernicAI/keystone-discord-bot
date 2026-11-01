# Mission

## The problem

A server owner who wants leveling, moderation, reaction roles, tickets and
logging installs MEE6 for XP, Dyno for automod, Carl-bot for reaction roles and a
fourth bot for tickets. That is:

- **~$24–40/month** for the premium tiers that remove the caps (see [[Pain-Points]]).
- **Four dashboards, four support servers, four invoices.**
- **Four partial member records.** The member's XP is in one bot, their warnings
  in another, their ticket history in a third.
- **Four chances to be abandoned.** Groovy vanished in a week with 16M servers.
  BotGhost's users lost every configuration because the platform had no export.

The category is not "solved by a bigger bot". It is unsolved because each
vendor optimises for a per-server subscription on one slice of the problem.

## The bet

**Ship the union, free, and teach people how it works.**

1. **Free core, permanently.** The free tier is the product, not a demo. No
   feature that exists is ever moved behind a paywall — the single most-cited
   complaint in the category is *retroactive* re-gating, and we will not do it.
2. **One bot, one config, one audit trail.** Moderation, security, leveling,
   tickets, logging, embeds and automations share a role hierarchy and a case
   file, so an anti-nuke action and a warning can live in the same record.
3. **Explainable, reversible moderation.** Dry-run by default, evidence before
   punishment, an appeal path, and a full audit trail.
4. **Data is the server's.** One-click export of everything, real deletion
   (including infractions), published retention table.
5. **The repo is the course.** Every module ships a spec, an ADR trail, annotated
   source and an exercise. Reading the code should be a legitimate way to learn
   to build software.

## Who it is for

- **Server admins** who are tired of paying four subscriptions for basics.
- **Self-hosters** who want to own their data and their uptime.
- **Learners** who want a real, non-toy codebase with tests and a design trail.
- **Contributors** who want to add one feature without understanding a monolith.

## What success looks like

- A server can delete every other bot and lose nothing but muscle memory.
- A newcomer can clone, run `pnpm check` green, and open their first PR in a day.
- An admin can export the whole server's Keystone data to JSON and leave.
- The docs explain not just *what* was built but *why the alternatives lost*.

## Non-goals

- Being the cheapest host. Hosting is convenience, not the product.
- Feature-count marketing ("500 commands!"). We budget commands and document
  every one; see [[Command-Budget]].
- Bundling a YouTube ripper. See [[Non-Negotiables]].
