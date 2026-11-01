# North star

> **One bot a server never has to replace, and one codebase a person can
> actually learn from.**

## The test for every feature

A feature earns its place only if it passes all five:

1. **Removes a bot.** Which of MEE6 / Dyno / Carl / Ticket Tool / Wick does this
   let an admin uninstall? If none, it is polish, and polish waits.
2. **Works on the free tier.** If the design only makes sense as a paid upsell,
   redesign it or drop it.
3. **Is reversible.** Can an admin undo it, export it, and see why it happened?
   Moderation actions without evidence and appeals do not qualify.
4. **Fits the budget.** Global commands ≤ 100, Components V2 ≤ 40 slots per
   message, and no new privileged intent without a written justification.
   See [[Command-Budget]].
5. **Can be taught.** Is there a spec, a test and an exercise a learner can
   follow? If not, it is not finished.

## The test for every technical choice

- **Does it shrink the contributor loop?** Clone → install → test must stay
  under five minutes and must never require a bot token.
- **Does it survive a dependency dying?** discord.js is quarantined behind
  `apps/bot/src/adapt.ts`; the kernel speaks our own types.
- **Would we be embarrassed to explain it?** If the answer is "it's a hack",
  write the ADR, then either fix it or make the hack explicit.

## Anti-goals

- Optimising the number of features instead of the number of bots uninstalled.
- Any metric that rewards time-in-app over tasks-completed.
- Growth mechanics that make leaving harder (data lock-in, per-server lifetime
  licenses, decaying configuration).
