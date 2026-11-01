# ADR-0012 — Required and optional intents, and a single channel resolver

## Status

Accepted · 2026-10-31 · P4.5

## Context

Discord changed the privileged-intent threshold from 100 servers to **10,000
unique users** in June 2026, with annual reapplication and a separate
verification process. A bot that needs `GuildMembers` or `MessageContent` for
its core commands is one review decision away from losing them.

At the same time, the channel-obfuscation rollout on **2026-11-16** means a
bot's channel cache is no longer a complete description of a guild. Hidden
channels disappear from HTTP and arrive with the `CHANNEL_OBFUSCATED` flag and a
placeholder name.

The current manifests put `GuildMembers` and `MessageContent` in the same list
as `Guilds`, so there is no way for an operator to say "run the core without
privileged intents" and no way for `/setup` to name what would be lost.

## Decision

1. A module declares `intents` (required) and `optionalIntents` (privileged but
   not required), plus an `intentFallbacks` note for each optional intent.
2. `INTENT_PROFILE=minimal|full` selects the deployment. `minimal` requests only
   required intents; `full` adds the optional ones. The default is `full` to
   preserve existing behaviour, but `minimal` is the 10,000-user-safe profile.
3. `/setup` reports the profile, every requested intent and every disabled
   feature by name. It reports what was requested, not what Discord granted: an
   app that requests an intent it has not enabled fails login with close code
   4014 before `/setup` can run.
4. Every channel lookup goes through `resolveChannel()` in `apps/bot/src/channels.ts`,
   which classifies `ok`, `hidden`, `missing` and `error`. Identity is the id,
   never the name. A hidden channel is a named, non-fatal outcome.
5. Manifest validation rejects an intent declared as both required and optional,
   duplicate optional intents, and a fallback that names an undeclared intent.

## Consequences

- Core commands work with `Guilds` alone; welcome, autorole, join gate, scanner
  and transcript text degrade with a named reason.
- The 10,000-user review becomes a deployment choice, not a rewrite.
- A hidden channel can no longer crash a log, ticket, starboard or stat loop.
- Operators must keep `INTENT_PROFILE` and the Developer Portal in sync; a
  mismatch is a login failure with a clear close code, not a silent feature gap.
- `/setup` grows one field and one next-step branch.

## Alternatives

- **Request every privileged intent by default and document the risk.** Rejected:
  the 10,000-user threshold makes that a product-wide single point of failure.
- **Remove privileged features entirely.** Rejected: welcome, join gates and
  automod are part of the union users expect; they should be optional, not gone.
- **Detect hidden channels by name only.** Rejected: Discord explicitly says the
  name is a placeholder; the flag is the contract.
- **Retry login with a smaller intent set after a 4014.** Rejected for now: a
  retry hides a configuration error and complicates shutdown. A clear boot error
  and a documented profile are easier to teach.
- **Put the resolver in the kernel.** Rejected: it depends on discord.js; the
  kernel must stay token-free. The adapter is the right seam.
