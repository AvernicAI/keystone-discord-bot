# <Module> — teaching note

## Read in this order

1. `manifest.ts` — what the module declares.
2. `service.ts` — the pure policy and the part you test.
3. `store.ts` — the persistence port the module owns.
4. `commands/` — the thin Discord surface.
5. `apps/bot/src/*` — the adapter half, only if you are changing Discord behavior.

## The problem

A concrete failure a real server hits.

## The naive version

What a tutorial does, and why it stops working.

## Our version

The two or three decisions that matter, with the reason.

## Exercise

A small change with a failing check. Run `pnpm lesson:verify <n>`.

## The mistake you will make

The specific trap this module is shaped to avoid.

## What we rejected

The alternatives, and why they lost.
