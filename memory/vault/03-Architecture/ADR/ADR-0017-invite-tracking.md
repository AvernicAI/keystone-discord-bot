# ADR-0017 — Invite tracking: diff the cache, store the join

## Status

Accepted · 2026-11-01 · P7. Supersedes none. Related:
[[04-Modules/invites/Spec|Invites spec]], [[04-Modules/invites/Teaching|Invites teaching]],
[[ADR-0006-ports-and-adapters]], [[Roadmap]].

## Context

Discord has no "member X used invite Y" event. The only signal is an invite's
`uses` counter moving from one value to the next. Building invite attribution
means accepting three facts:

1. The cache can be stale or incomplete (other bots, deleted invites, a restart).
2. Two members can join in the same tick, so both handlers may read the same
   "before" snapshot.
3. A suspicious join is evidence, not a verdict: a first-time Discord user looks
   exactly like a throwaway account by any simple heuristic.

The feature also needs a durable answer to "who invited whom?" and a leaderboard
that does not load every join into the bot process.

## Decision

1. **The diff is pure and lives in the module.** `attributeInvite(before, after)`
   finds the invite whose `uses` increased, breaks ties on the code, and returns
   `undefined` when nothing changed or the invite has no inviter. The gateway
   adapter only caches and fetches.
2. **Joins are serialized per guild.** `apps/bot/src/invite-events.ts` keeps one
   promise chain per guild, so a second join waits for the first diff and cache
   update. Different guilds do not block each other.
3. **The cache is process-local for now.** A restart between two joins can lose
   one attribution. That limitation is explicit; persisting counter snapshots is
   a later optimization, not a hidden assumption.
4. **One row per join, with a unique key.** `invite_joins` is unique on
   `(guild_id, user_id, joined_at)`; a repeated gateway delivery is a no-op. A
   leave marks the newest open row instead of deleting history. Leaderboard
   totals are SQL aggregates (`count(*)`, `count(left_at)`).
5. **Flags are advisory.** `account-age` and `no-avatar` are stored in
   `fake_reasons` and optionally posted to one log channel. The `InvitePort` has
   no ban, kick or timeout method. Moderation remains the only punishment path.
6. **One read-only root.** `/invites` covers leaderboard, stats and who-invited;
   settings belong to the existing dashboard write path, not a second editor.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Store a per-invite counter snapshot now | Adds a write per join and a second source of truth for a number Discord owns; the restart gap is recorded instead. |
| Diff `uses` without the invite code | Two changed invites make the answer arbitrary; the code is the deterministic tie-breaker. |
| One global promise chain | A slow invite fetch in one guild would block every other guild's joins. |
| Delete join rows on leave | Destroys retention history and makes "how many stayed?" unanswerable. |
| Punish inside the invite module | Duplicates the moderation policy, bypasses dry-run/review and turns a heuristic into an unappealable action. |
| A settings subcommand | The dashboard already edits every module through `SettingsService`; a second editor adds surface without capability. |
| Count vanity joins as an inviter's invite | No inviter exists; recording the row with a null inviter is honest. |

## Consequences

**Good**

- The same pure functions run in tests and production; the gateway file contains
  no policy.
- A duplicate delivery, a tie between changed invites and a disabled module are
  all provable without a Discord token.
- Retention is a SQL aggregate, so the read path does not grow with join history.
- A suspicious join never triggers an automatic action.

**Costs and limits**

- Process-local cache: a restart can lose one attribution, and there is no
  backfill before the first successful refresh.
- `ManageGuild` is required to list invites; without it joins are recorded with
  no inviter and one warning per guild.
- The live proof covers the command and the cache fetch, not a real
  `MEMBER_ADD`; a second Discord account is still needed.
- The leaderboard is embed-only, so a text-only MCP reader cannot inspect it.

## What this pass proves

- Attribution is deterministic for increment, new-code, unchanged, missing
  inviter and tie cases.
- A duplicate join writes once in memory and on PGlite.
- Leaves reduce `retained` and the totals survive a close/reopen.
- A flagged join sends exactly one advisory embed; a disabled module records
  nothing.
- `/invites` fits the budget and declares `GuildInvites` plus the optional
  `GuildMembers` consequence.
- AI Team registered 11 commands and ran `!invites leaderboard` / `!invites who`
  through the real dispatch pipeline.
