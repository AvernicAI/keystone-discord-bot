# Pain points

Prioritised from 2024–2026 reviews, vendor teardowns, support threads and
Hacker News discussion. Where a claim is second-hand, it says so.

## 1. Retroactive re-gating (highest volume)

Admins do not mainly object to premium existing. They object that configuration
they already made becomes read-only later:

> "MEE6 is used for is now locked behind a paywall, and I can't change any server
> settings I had set prior to the paywall." — r/discordapp (search snippet; Reddit
> blocks automated reads, so treat the quote as second-hand)

MEE6's own feature table lists moderation, automod, leveling, custom commands,
reaction roles and temp voice as premium. That is the free tier as a demo.

**Our answer:** the free tier is the product, and re-gating is banned by
[[Non-Negotiables]].

## 2. The stack tax

A working premium stack costs ~$24–40/month: MEE6 $11.95, Carl-bot $7.99, Dyno
$4.99–7.99, plus a ticket bot and an analytics bot. Each is per-server, so a
second community doubles parts of the bill. The same review describes "six
dashboards, six support servers, six invoices".

**Our answer:** one subscription for hosting, unlimited servers, no feature
metering.

## 3. Nobody actually covers everything

The three biggest bots are non-overlapping by design:

- MEE6: leveling, but no reaction roles and moderation is paid.
- Dyno: no leveling, no reaction roles.
- Carl-bot: zero leveling, and logging capped at 1–2 channels free.

The "all-in-one" label is marketing for "one of three, plus a dashboard".

**Our answer:** the P3 parity checklist is a union, not a superset.

## 4. Metered basics

- Ticket Tool free: transcripts auto-delete after 30 days, branding footer,
  capped panels and categories. Paid is per-server.
- Ticketsbot free: 3 open tickets.
- Carl-bot free: 1–2 logging channels, role persistence behind premium.

An audit trail that expires when you stop paying is not an audit trail.

**Our answer:** transcripts are permanent and exportable on every tier; logs are
unlimited because they are rows in a database we already run.

## 5. No real security in a generalist

Anti-nuke lives in specialist bots (Wick, Security Bot, Beemo) with a separate
config, separate role hierarchy and separate invoice. ProBot's anti-raid is the
only generalist attempt found. After a real nuke, restore is a different product
(Xenon), and non-imaging restore "lacks a lot of information" by the vendor's own
docs.

**Our answer:** security ships in the same bot, sharing the role hierarchy and
case file, and restore includes messages.

## 6. Moderation false positives

Discord's own AI moderation wrongfully banned 8,000+ accounts by matching
spreadsheets, chessboards and game textures (TechCrunch, 2026-07-07). At bot
level, substring filters catch "password reset" for `ass`, "scampi" for `scam*`,
"wormhole" for `*hole`. Auto-timeouts on noisy rules mute regulars.

**Our answer:** alert-only default, per-channel context, why-flagged reasoning,
appeal button in the same message, and a review queue instead of instant action.

## 7. Data you cannot get out, or delete

- BotGhost's shutdown notice: "there is no way for us to export your bot's
  configuration… all bots and user data will be permanently lost."
- MEE6's own GDPR response reportedly keeps infraction records after a deletion
  request and has no access logs (public gist).

**Our answer:** export everything, delete everything, publish retention.

## 8. Abandonment risk

Groovy (16M servers) and Rythm (20M servers) died within a month of each other
after YouTube cease-and-desists. MEE6 removed music in 2023. Loritta went
closed-source in May 2026 citing users who took code without contributing.

**Our answer:** open source, self-hostable, documented runbooks, and no feature
whose legality depends on a third party's tolerance.

## What "clearly the best" means to these users

1. Delete the other bots and lose nothing.
2. Never lose access to something already configured.
3. See why the bot did what it did, and undo it.
4. Take the data and leave.
5. Still work next year.
