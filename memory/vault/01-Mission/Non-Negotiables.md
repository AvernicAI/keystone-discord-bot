# Non-negotiables

These are promises, not preferences. A PR that breaks one is rejected regardless
of how good the feature is.

## 1. The free tier is the product

- Every feature that ships is available free, on every server, with no cap that
  exists only to sell an upgrade.
- **No retroactive re-gating.** Nothing that was free becomes paid, ever. If we
  cannot afford to run it free, we do not ship it.
- Paid hosting may sell *convenience*: managed uptime, backups, AI credits at
  cost, a custom bot identity. It may never sell a feature that self-hosters
  cannot have.

## 2. The server owns its data

- `/export` returns the guild's full configuration and history as JSON.
- Deletion is real: warnings, cases, XP and ticket transcripts are deleted, not
  "anonymised" while the row survives.
- A published retention table says exactly how long each category lives.
- No message content is stored unless a feature cannot work without it, and then
  it is off by default and documented in the retention table.

## 3. Moderation is explainable and reversible

- Default posture is **alert-only**. Punishment is opt-in per rule.
- Every automated action carries a reason and the evidence that triggered it.
- Every punishment can be appealed from the same message that announced it.
- No AI model may take a destructive action on its own. It may recommend.

## 4. No dark patterns

- No fake scarcity timers, no "30% off" banners that never end.
- No per-server lifetime licences. No configuration that decays.
- Cancelling does not delete anything. Leaving does not delete anything.

## 5. Nothing illegal or unstable ships enabled

- No bundled YouTube/Spotify streamer. Music is opt-in and bring-your-own
  Lavalink (see [[99-Meta/Open-Questions|Q-3]]; [[Platform-Limits]]).
- No privileged intent enabled "just in case". Each one needs a written use case
  and a fallback that works without it.
- No feature that requires a role above the bot's own role to function.

## 6. Teaching is part of the definition of done

- Spec, tests and a teaching note, or it is not merged.
- The "alternatives rejected" section is mandatory in every ADR.
- A contributor must never need a bot token or a live guild to run the tests.

## 7. One bot, no sharding surprises

- Every feature works in a DM if it makes sense there, and refuses clearly if it
  does not.
- Adding a module may not require editing another module.
- The command budget is enforced in CI, not by memory.
