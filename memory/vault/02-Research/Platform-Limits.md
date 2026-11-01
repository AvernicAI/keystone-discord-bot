# Platform limits

The constraints that shaped the architecture. Everything here comes from
`docs.discord.com` (the post-2025 canonical host; old developer URLs redirect).

## The three that changed the design

### 1. 100 global slash commands

Per application: 100 chat-input, 15 user-context, 15 message-context, 1
primary-entry-point. Options ≤ 25 per command, nesting one level only, and the
serialised payload caps at 8,000 characters including the longest localisation.

**Consequence:** commands are a budget, not a namespace. We spend them on hubs
(`/setup`, `/mod`, `/config`) and route detail through subcommand groups. See
[[Command-Budget]] and [[ADR-0003-command-budget]].

### 2. Components V2

Set message flag `IS_COMPONENTS_V2` (1 << 15) and the message switches to the new
layout system: Container, Section, Text Display, Thumbnail, Media Gallery, File,
Separator. `content`, `embeds`, `poll` and stickers stop working — and **the flag
cannot be removed from that message**.

- **40 components per message, total**, nested ones included. A dashboard with
  five action rows has already spent six slots.
- Deferred responses can only be ephemeral; to send V2 you defer, then **edit**
  the original response with the flag. That two-step is a hard requirement, not a
  style choice.
- Modals: title ≤ 45 chars, 1–5 top-level components, Text Input must live inside
  a Label (Action Row + Text Input is deprecated). New: File Upload, Radio Group,
  Checkbox Group, Checkbox.
- `custom_id` ≤ 100 chars and unique per message.

**Consequence:** `packages/ui` needs a layout budgeter, not an embed-string
builder. Every interactive surface is designed against a 40-slot budget.

### 3. Privileged intents

`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`. The approval threshold
moved from 100 servers to **10,000 users**, with **annual re-application**;
verification and intent review are now separate processes.

**Consequence:** slash-first. Prefix commands, arbitrary-message AI and "scan
everything" features are opt-in extras behind an intent we can justify in one
sentence each. Anything that can work from interactions or on-demand fetches
must.

## Operational limits worth remembering

| Limit | Value | Why it matters |
| --- | --- | --- |
| Global rate limit | 50 req/s per bot | Interaction endpoints are exempt — prefer them over REST sends |
| Invalid requests | 10,000 per 10 min | 401/403/429 count. A permission bug across guilds can ban the IP in seconds |
| Interaction response | 3 s to first response, 15 min token | Defer anything slow; never call an LLM inline |
| Gateway send | 120 events/60 s per connection | Bulk operations belong in a worker |
| IDENTIFY | 1,000 per 24 h globally | Hitting it resets the token |
| Sharding | required at 2,500 guilds; 2,500/shard | Entitlement and DM events land on shard 0 only |
| Native AutoMod | 6 keyword + 10 regex rules/guild; regex is Rust flavour, 260 chars | Richer filtering must be our own scanner |
| Timeout | max 28 days | — |
| Bulk ban | 200 users | — |
| Ban message deletion | up to 7 days | — |
| Scheduled events | 100 scheduled/active per guild | — |
| Category | 50 channels | — |
| Channel obfuscation | **2026-11-16** | Hidden channels disappear from HTTP and arrive nulled on gateway; detect via `CHANNEL_OBFUSCATED` (1 << 17), never by name |

## What this buys us

A bot that looks simple to a user but is explicitly engineered around scarcity:
few commands, dense components, few intents, and every destructive call preceded
by a permission check so we never spend the invalid-request budget.

## Still unverified

- Whether App Verification is still hard-required at 100 guilds. The gateway docs
  say verified apps are required for 100+ guilds, but the dedicated verification
  page 404'd during research. Confirm in the portal before launch.
- Components V2 *text* budgets (the 40-component cap is documented; a 4,000-char
  text-display guidance is community-reported).
- Per-webhook execution rate. The widely repeated "30/min" is not in current
  docs — derive from headers instead.
