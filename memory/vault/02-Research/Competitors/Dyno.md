# Dyno

**Position:** the moderation workhorse with the cleanest module dashboard.

## Pricing (2026)

Standard $5.99/mo, Premium $7.99/mo, Custom $12.99/mo (they host a bot under your
token). Per server; annual roughly 8× monthly. Non-profits can get premium free.

## What is free vs paid

| Free | Paid |
| --- | --- |
| 19 automod filters | Advanced automod |
| Moderation commands | Multichannel logging, unlimited embedder entries |
| 1 reaction-role message, 3 embeds, 10 custom commands | Unlimited versions of each |
| 1 ticket panel | Linked panels, voice-text linking |
| 3 concurrent giveaways | Unlimited giveaways |
| Starboard, welcome | Custom images, Levels module |

**Dyno has no leveling on free.** Leveling is a paid module, and there are no
reaction roles at all.

## What they do well

- **Modular dashboard.** Each module is configured in isolation; nothing is hidden
  behind a command syntax.
- **Automod breadth.** 19 free filters is the most generous detection tier in the
  category.
- **Stability.** Years of uptime and a familiar permission model.

## Where it is weak

- Premium requires inviting a **second bot** for some features, which means
  re-creating embeds and reaction-role messages — a real migration tax caused by
  a pricing decision.
- No reaction roles, no leveling on free: it cannot be the only bot either.
- The dashboard can overwhelm a first-time admin.

## What we take

- Module isolation in the UI as well as the code.
- Alert-first automod defaults.

## What we do differently

- Leveling and reaction roles are core, free, in the same bot.
- No second bot for premium features. Ever.
