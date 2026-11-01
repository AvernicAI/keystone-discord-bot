# ADR-0009 — Select rows and archived season resets extend CommunityPort

## Status

Accepted, 2026-11-01. Implemented in pass 07 as a P3 completion.

## Context

P3 originally shipped button-only reaction roles and in-place XP resets were not
built. Closing the remaining parity rows needs two structural additions:

- Discord select menus (multi-select, up to 25 options) are a different component
  shape from buttons and need a safe way to reconcile a user's selected role set.
- A seasonal reset must clear the leaderboard without destroying history. The
  matrix explicitly says “archive, don’t destroy”, and a retry must not archive
  the same season twice.

These must stay behind the existing `CommunityPort`; modules still may not import
discord.js, Drizzle or message tables.

## Decision

1. Extend the kernel’s structural `ActionRow` with `SelectComponent`. The adapter
   is the only place that maps it to a discord.js `StringSelectMenuBuilder`.
2. Extend `CommunityStore` with `resetLevels(guildId, seasonKey)` returning
   `{ archived, alreadyReset }`. Postgres implements it in one transaction:
   copy profiles to `community_records` (`xp_season_archive`), write an
   idempotency marker (`xp_season_marker`), then delete the current `levels`
   projection. The XP event ledger remains untouched.
3. Extend `CommunityActions` with `deleteMessage` so sticky refresh only deletes
   the recorded sticky message, never an arbitrary user message.
4. Keep P3’s three roots. New admin paths are actions on `/tools` and `/rank`,
   not new commands. Select role panels use one custom id; the handler reconciles
   selected versus managed roles server-side.

## Consequences

- Select menus consume one action row, not 25 buttons; the 40-component message
  budget stays safe.
- A repeated season start returns `alreadyReset: true` and archives nothing; a
  rollover after a crash is safe to retry.
- `levels` is disposable state by design. History lives in `xp_events` and the
  season archive records, so clearing the projection is not data loss.
- Sticky deletion is scoped to a message id the bot created and stored.

## Alternatives

- **A second store for seasons.** Rejected: season state is guild-scoped
  community data; a second port would duplicate transaction and test plumbing.
- **Delete levels without archive.** Rejected: violates “archive, don’t destroy”
  and makes a disputed reset unexplainable.
- **Archive only when an operator exports.** Rejected: export is P5 and a reset
  must be safe before the dashboard exists.
- **One button per selectable role.** Rejected: five rows of five buttons is
  noisy, and Discord’s select component is the platform-native multi-select.
- **Let the interaction handler edit roles directly.** Rejected: policy and
  ownership checks belong in the service; the adapter only forwards values.
- **A new `/roles` or `/season` root.** Rejected: the command ledger stays
  inside the existing `/rank` and `/tools` roots.
