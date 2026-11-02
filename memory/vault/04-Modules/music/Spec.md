# Music — spec

A saved queue that is real data, and a playback seam that refuses until a real
player exists. `/music` never shows a queue that pretends to be audio.

## Purpose

Every all-in-one bot that once shipped music either removed it (MEE6, 2023) or
never had it (Dyno, Carl). Streaming is the feature users ask for and the one
most likely to be faked with a queue view and a "now playing" line.

Keystone splits the two capabilities:

- **Saved queue** — durable rows, inspectable, editable. This ships.
- **Playback** — a `MusicPlayback` port. This build installs one adapter and it
  is explicitly unavailable, because the repository has no Discord voice client
  and no Lavalink client, and no `LAVALINK_URL` is configured.

The rule is the same one analytics follows: every figure and every claim must be
traceable. A track in the queue is a row; "playing" is only printed when a
playback adapter returns `ok: true`.

## Commands

One root, eight subcommands. Guards: guild-only, two-second cooldown. `remove`
and `clear` also require `ManageGuild`, because they mutate shared state.

| Command | Behaviour | Shipping status |
| --- | --- | --- |
| `/music status` | Module state, queue count, playback availability and the exact blocker. Works while disabled. | Real |
| `/music queue` | Lists the saved queue (first ten) and says nothing is playing. | Real |
| `/music add` | Validates an http(s) URL, derives a label, appends a track. | Real |
| `/music remove` | Removes one track by 1-based position. | Real |
| `/music clear` | Removes every saved track. | Real |
| `/music play` | Calls the playback port. | Refuses: no backend |
| `/music skip` | Calls the playback port. | Refuses: no backend |
| `/music stop` | Calls the playback port. | Refuses: no backend |

The refusal is not a generic error: it names the missing pieces (Discord voice
client, Lavalink client, `LAVALINK_URL`) and the same text appears in
`/music status`.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `false` | Music is opt-in; every queue and playback command except `status` refuses when false |
| `maxTracks` | integer 1–100 | `25` | Cap enforced inside the store, not only in the command |

Settings use the module's Zod schema through the shared `SettingsService`, so
`/config get module=music` and `/config set` work without a music-specific path.

## Storage

The queue reuses `community_records`; no migration is added.

```text
(guild_id, kind = 'music_queue', key = 'default')
data = { tracks: [{ id, title, uri, requestedBy, addedAt }] }
```

- `DrizzleMusicStore` runs every mutation in a transaction and takes a
  `SELECT ... FOR UPDATE` lock on the guild row, so concurrent adds cannot both
  consume the last slot.
- `InMemoryMusicStore` serializes mutations per guild with a promise chain and
  enforces the same cap.
- An empty queue deletes the row rather than storing an empty list.

There is intentionally no duration, artist, artwork or play-count field. Those
would have to come from a playback backend; inventing them is the failure this
pass is written to avoid.

## The playback seam

`packages/kernel/src/music.ts` defines `MusicPlayback` with `status`, `play`,
`skip` and `stop`. `UnavailableMusicPlayback` returns:

```text
available: false, backend: "none",
missing: ["Discord voice client", "Lavalink client", "LAVALINK_URL"]
```

A future Lavalink adapter implements the same interface and changes no command.
The manifest does not request `GuildVoiceStates` today, because a build that
cannot join a channel should not ask for the intent.

## Where the code lives

- `packages/kernel/src/music.ts` — track/queue types, `MusicStore`,
  `MusicPlayback`, `MusicPort` and the stable `community_records` identity.
- `modules/music/src/music.ts` — `MusicService`: settings, URL validation,
  disabled policy and propagation of refusals.
- `modules/music/src/store.ts` — in-memory queue with a per-guild lock.
- `modules/music/src/playback.ts` — the one, explicit unavailable adapter.
- `modules/music/src/commands/music.ts` — guards, rendering and dispatch.
- `packages/db/src/music-store.ts` — SQL queue over `community_records`.

## Non-goals

- Bundled or scraped audio sources (legal risk, marked non-goal in the matrix).
- Lyrics, autoplay, recommendations or a "now playing" bar without a player.
- Buttons and select menus in this pass. The command surface carries the state;
  components are a later UI pass.
- A second queue table. `community_records` already has the right identity.

## Limits respected

- One new global root; the ledger was `18/100` at this pass (now `20/100`) and eight subcommands cost no
  extra slot.
- No new dependency, no paid service, no new intent.
- The SQL adapter uses the existing guild row for locking; no advisory-lock
  extension is required.

## Verified by

`modules/music/src/music.test.ts` (14 tests: registry shape, URL validation,
disabled refusal, cap, remove/clear permissions, playback refusals),
`packages/db/src/music-store.test.ts` (3 PGlite tests including a raw
`community_records` query and a concurrent-add cap test) and the live transcript
in [[04-Modules/music/Status|Status]].
