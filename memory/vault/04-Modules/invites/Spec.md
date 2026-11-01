# Invites — spec

Invite attribution and retention for a guild. Answers "who invited this member?",
"how many people has this inviter brought in, and how many stayed?" and "does
this join look like a throwaway account?".

## Purpose

Invite tracking is the one community feature MEE6 sells as a separate paid
plugin. Keystone ships it free, and it is also the join-side data that the
anti-raid scanner cannot infer on its own: a burst of joins is much easier to
read when every join names the invite and the inviter behind it.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/invites` | `action` (`leaderboard`, `stats`, `who`), optional `user`, optional `limit` | guild-only, 3-second per-user cooldown | `leaderboard`: top inviters by retained joins; `stats`: one member's joins/retained; `who`: the inviter and code recorded for a member |

The command is read-only. It never writes settings and never punishes anyone.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Record joins and leaves |
| `logChannelId` | string? | unset | Post flagged joins here; unset means record-only |
| `minAccountAgeDays` | integer 0–365 | `7` | Flag accounts younger than this; `0` disables |
| `flagNoAvatar` | boolean | `true` | Flag joins with no profile avatar |
| `leaderboardSize` | integer 1–25 | `10` | Default rows for `/invites leaderboard` |

Settings are edited through the existing dashboard editor or `PATCH
/api/v1/guilds/:id/settings/invites`; there is no second settings store.

## How attribution works

Discord does not say which invite a member redeemed. It only increments that
invite's `uses` counter. The gateway adapter therefore:

1. Caches `code → {uses, inviterId}` on ready, on `GuildCreate`, and on every
   `InviteCreate` / `InviteDelete`.
2. On `GuildMemberAdd`, fetches the guild's invites again and diffs the counters
   through `attributeInvite(before, after)`.
3. Picks the invite with the largest increase; ties break on the invite code so
   the answer is deterministic. If nothing increased, the join is recorded with
   no inviter (vanity URL, bot invite, or an invite created before tracking).
4. Serializes joins per guild. Two members arriving in the same tick would
   otherwise both diff against the same "before" snapshot and double-count one
   invite.

`/invites who` reads the newest attributed join for a member, so a member who
left and rejoined has the latest answer.

## Fake-invite flags

`suspiciousReasons()` returns advisory labels:

- `account-age` — the account is younger than `minAccountAgeDays`.
- `no-avatar` — the account has no profile avatar.

They are stored on the join row in `fake_reasons` and posted once to the log
channel when configured. **No punishment is attached.** A first-time Discord user
looks exactly like a raider by these rules, so the module records evidence and
leaves the decision to a human or to the moderation module's separate, dry-run
default policy.

## Data

One row per join in `invite_joins`:

```
guild_id, user_id, inviter_id?, code?, fake_reasons jsonb,
joined_at timestamptz, left_at timestamptz?, created_at
```

`(guild_id, user_id, joined_at)` is unique, which makes a repeated gateway
delivery idempotent without inventing a sequence. A leave marks the newest open
row; history is never deleted. Leaderboard totals are computed in SQL
(`count(*)`, `count(left_at)`), not by loading every join into the process.

## Intents and permissions

- Required intents: `Guilds`, `GuildInvites`.
- Optional intent: `GuildMembers`. Without it, joins and leaves are invisible;
  existing records stay readable. `/setup` names that consequence.
- Bot permission: `ManageGuild` to list a guild's invites. Without it the cache
  cannot be refreshed; joins are still recorded without an inviter and the
  warning is logged once per guild.

## Non-goals

- Punishing a suspicious join. Flags are evidence, not verdicts.
- Leaderboards across guilds. Invites are server-scoped.
- Scraping or preserving Discord invites after they are deleted.
- Counting vanity URL joins as a member's invites.

## Limits respected

- One new global root (`11/100` at the time this shipped).
- One row per join; totals are aggregated at read time.
- No message content is read for this feature.

## Verified by

`modules/invites/src/invites.test.ts` (diff, flags, service, idempotency),
`modules/invites/src/commands.test.ts` (registry, budget, all three actions) and
`packages/db/src/invite-store.test.ts` (SQL totals, leave marking, restart).
