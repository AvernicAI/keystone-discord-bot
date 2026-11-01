# ADR-0001 — discord.js v14 behind a thin adapter

## Status

Accepted — 2026-10-31. Revisit at P8 for v15.

## Context

We need a gateway library, and it is the single dependency hardest to replace
later. The realistic candidates were discord.js, Oceanic, Sapphire (a framework
over discord.js), and a Python stack (discord.py/Pycord).

- discord.js v15 is **pre-release**. The official guide warns against production
  use, and the milestone had no due date. v15 renames `ready` → `clientReady`,
  removes `Formatters`, moves sharding into `@discordjs/ws` and drops `Guild#shard`.
- Oceanic is modern and credible, but publishes no benchmark, and the "faster
  than discord.js" claim is folklore. Its ecosystem is far smaller, which shifts
  cost onto contributors.
- Sapphire gives us stores, pieces and preconditions for free, but ties our types
  and release cadence to a framework whose 2026 activity we could not verify.

The audience matters here: an open-source teaching project lives or dies on
whether a newcomer can find an answer to "how do I do X" in a search engine.

## Decision

Use **discord.js v14**, and confine it to `apps/bot/src/adapt.ts` plus the client
factory. The kernel defines its own `InteractionLike`, `ReplyInput` and `Command`
types. Modules never import discord.js.

## Consequences

- Every command is testable with a plain object; no token, no gateway, no guild.
- The v15 migration is one adapter file, not a repository-wide find-and-replace.
- We give up Sapphire's built-in argument parsing and preconditions. We wrote
  ~300 lines of registry and guards instead, which we can teach line by line.
- We accept discord.js's heavier type surface in one file, and cast once
  (`ReplyInput` → `InteractionReplyOptions`) with a comment explaining why.

## Alternatives

| Option | Why it lost |
| --- | --- |
| discord.js v15 | Pre-release; no date; large breaking surface |
| Oceanic | Unverified performance, tiny ecosystem, contributor unfamiliarity |
| Sapphire framework | Couples types and cadence; unverified maintenance; name collision in search |
| discord.py / Pycord | Splits the stack; no TS dashboard sharing the same types |
| Raw HTTP + gateway | Maximum control, maximum maintenance; wrong use of contributor time |
