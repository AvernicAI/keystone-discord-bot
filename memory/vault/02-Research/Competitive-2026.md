# Competitive research — paid all-in-one bots (2026)

> Research wave for [[ADR-0013-roadmap-v2-portability-first]]. Claims and
> confidence live in [[Claims]]; raw machine truth is `memory/machine/research.json`.

## What was read

Official docs and pricing pages where they rendered; Patreon for Carl-bot;
third-party comparisons where a vendor page was client-rendered. Reddit and
Trustpilot page bodies were blocked during the pass, so their claims are marked
as snippet-only and are not used in marketing.

## Price map

| Bot | Free tier | Paid shape | Confidence |
| --- | --- | --- | --- |
| MEE6 | Leveling and basic automod | Per-server subscription, roughly $12/month; AI sold separately | Medium — pricing page rendered client-side |
| Dyno | Broad module set with low caps | Standard / Premium / Custom; annual discount | Medium — tier names official, prices third-party |
| Carl-bot | Deliberately deep free tier | Per-server slots, roughly $8–$25/month | High on tier ladder — Patreon read directly |
| Ticket Tool | Working ticket bot | Roughly $8/month; premium buys a faster shard and soft limits | Medium |
| ProBot | Roles, moderation, leveling | Two tiers; Tier 2 adds anti-raid and custom identity | Medium |
| Security Bot | Anti-nuke, anti-raid, captcha | Roughly $3.50/month; custom identity extra | High — homepage read |
| Arcane | Message/reaction XP | Roughly $7/month; voice XP and limits paywalled | High on paywall — premium docs read |
| Apollo / sesh | Events and RSVP | Roughly $7–$25/month; recurring events and sync paywalled | High — pricing pages read |
| Wick | Anti-nuke / anti-raid | Opaque public pricing | Low — no official price table found |

**Pattern:** single-server paid tiers cluster around **$3.50–$8/month**. MEE6 is
the outlier. Per-server billing is the specific trigger users name when they
switch.

## The eight paywall archetypes

1. **Limit removal** — more reaction roles, more panels, more templates. The most
   common pattern: you buy multiples, not features.
2. **A faster/private shard** — Ticket Tool, Dyno Custom, Arcane premium bot.
3. **White-label identity** — own name, avatar, banner, status. Present in most
   premium tiers.
4. **Integrations** — Google Calendar/Drive, YouTube/Twitch/Kick/TikTok/Reddit
   feeds. This is where 2025–26 R&D actually went.
5. **Retention and analytics** — longer logs, message archives, ticket stats.
6. **Automation** — recurring events, scheduled panel availability, auto-archive.
7. **API and webhooks** — almost only on a top tier.
8. **AI sold separately** — MEE6 unbundled it into a second subscription.

## What is still absent from every generalist

- **Cross-bot data portability.** No generalist exports its own config and
  history; imports are implemented by destination bots, never by sources.
- **Low-tier API access.** No $5–$8 plan includes a documented API.
- **Audit-grade data handling.** No bot sells per-table retention, export/delete
  receipts or configurable data residency.
- **Semantic search across a server's own cases, tickets and logs.**
- **Verified-identity gating** beyond captcha and heuristics.
- **Usage-metered pricing** — everyone sells flat per-server seats, so small
  servers overpay and large servers hit soft limits.

## What Keystone copies, and what it refuses

**Copy the capability:** reaction roles/selects, ticket transcripts, event RSVP,
invite tracking, forms, analytics, feeds, API, retention controls.

**Refuse the paywall:** artificial caps, faster-shard upsells, white-label as a
feature, per-server feature locks, retroactive re-gating. These are the exact
complaints the mission exists to answer.

## Strategic consequence

The dashboard is table stakes, not a differentiator. Portability, an API at every
tier, compliance-grade data handling and semantic search are the gaps worth
owning. That is why P5 is portability and P6 is the dashboard, not the reverse.
See [[Master-Plan]] and [[Parity-Matrix]].
