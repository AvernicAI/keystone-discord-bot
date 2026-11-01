# Open questions

Nothing below P7 is blocked by these. The repo ships without a `LICENSE` file
until Q-1 is answered, deliberately — a licence is the owner's call, not a
default.

## Q-1 — Licence: AGPL-3.0 or MIT?

- **AGPL-3.0 (recommended).** Anyone running a modified Keystone as a service must
  publish their changes. Protects a hosted tier from being cloned. Cost: some
  companies and contributors avoid AGPL, and it cannot be combined into MIT code.
- **MIT.** Maximum adoption and contribution surface; a competitor can host a
  closed fork. Cost: the hosted tier's only moat is operations and brand.

**What changes either way:** add `LICENSE`, set `license` in every
`package.json`, add a header policy for new files, and note it in
[[Governance]] (no CLA either way).

## Q-2 — v1 scope

- **A: moderation + tickets + logging first (recommended).** Smaller, ships
  sooner, validates the case model and the dashboard with the features admins
  need most.
- **B: full P2 + P3 block.** Parity with the big three at launch, much longer
  before anyone can use it.

**What changes:** the P2/P3 ordering in [[Roadmap]] and the parity checklist.
Nothing in the kernel.

## Q-3 — Music

- **Bring-your-own Lavalink only (recommended).** No bundled YouTube source, off
  by default, legal page explains why.
- **No music at all.** Simpler, and removes a whole class of support burden.
- **Bundled streamer.** Rejected: Groovy and Rythm were killed by cease-and-desist,
  and MEE6 removed music in 2023. It would put every self-hoster at risk.

## Assumptions we are proceeding on

1. **Hosted tier exists eventually**, but the free self-host path stays first
   class. If hosting never happens, AGPL still costs us little.
2. **We will cross 10,000 users**, so slash-first and intent minimalism are
   permanent design constraints, not temporary ones.
3. **Discord will keep changing the platform** (Components V2, channel
   obfuscation on 2026-11-16). A thin adapter is cheaper than predicting.
4. **The maintainer is one person plus agents.** Scope control and the memory
   system are survival tools, not process theatre.

## Research caveats we are carrying

- App Verification at 100 guilds could not be confirmed from a live policy page
  (404s); confirmed via gateway docs wording only.
- MEE6's "data breach" claim is **unverified** and must not be repeated.
- Several competitor prices come from third-party teardowns because the official
  pages are JS-rendered or block scrapers.
- Per-webhook rate limits are undocumented; derive from headers, never from the
  folklore "30/min".
- Reddit quotes in [[Pain-Points]] are search snippets, not fetched pages.

## Answered

_(none yet — move answers here when decided, and update
`memory/machine/project.json`)_
