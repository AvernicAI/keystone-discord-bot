# Music — spec

One durable queue that is also the play queue, one Lavalink node behind a kernel
port, one signed card, and a dashboard that sends controls instead of owning a
player.

## Purpose

Every all-in-one bot that once shipped music either removed it (MEE6, 2023) or
never had it (Dyno, Carl). Music is the feature users ask for and the one most
easily faked with a queue view and a "now playing" line. Keystone's rule is the
one analytics follows: a figure is traceable or it is not printed. A track in the
queue is a row; "playing" is printed only when the node reports a player.

The second rule is that nothing here may cost money. The node is the operator's
own container, the audio is a direct http(s) URL the operator supplies, and no
scraper, hosted resolver or paid host is bundled.

## The shape

```text
Discord card ──button/select──▶ music-interactions ─┐
/music … ──────command───────▶ MusicService ────────┼──▶ MusicPlayback (port)
Dashboard ──Redis request───▶ music-control ────────┘        │
        ▲                                                     ▼
        └──── published state ◀── reporter ◀── QueueMusicPlayback ──▶ VoiceNode
                                                                      │
                                                              ShoukakuNode
                                                                      │
                                                                 Lavalink 4.2.2
```

`VoiceNode` is the only seam that knows about audio transport:
`join`, `resolve`, `leave`, `status`. `ShoukakuNode` implements it with Shoukaku
and discord.js. `QueueMusicPlayback` implements the kernel `MusicPlayback` port
on top of `VoiceNode` and `MusicStore`. The kernel imports neither Shoukaku nor
discord.js; the web app never imports either at all.

## The durable queue is the play queue

No new table and no migration: `community_records` with kind `music_queue`, key
`default`.

```text
(guild_id, kind = 'music_queue', key = 'default')
data = { tracks: [{ id, title, uri, requestedBy, addedAt,
                    durationMs?, artist?, artworkUrl?, isStream?, source?, identifier? }] }
```

- `tracks[0]` is the current track and is removed when it ends or is skipped.
- `add` appends. `play` with `next:true` inserts at position 2.
- `loop:track` replays the head without touching the row; `loop:queue` rotates
  the head to the end; `shuffle` keeps the head and shuffles the rest.
- `jump n` replaces the row with `tracks[n-1..]` before starting it, so the
  skipped tracks cannot come back after a restart.
- `remove 1` is a skip; `remove n` is a plain delete; `clear` deletes the row and
  stops the player; `stop` also leaves voice.
- `encoded` stays in memory by design. Persisting a Lavalink-encoded track would
  multiply a 100-track row by roughly 20× for no correctness gain; the head is
  re-resolved on resume, at the documented cost of starting at `0:00`.
- `DrizzleMusicStore` takes a `SELECT ... FOR UPDATE` lock on the guild row, so
  the cap holds under concurrent adds; the in-memory store serialises per guild
  with a promise chain.

## The card

`modules/music/src/panel.ts` is a pure renderer for a Components V2 panel:

- accent per state (playing, paused, idle, unavailable);
- the title linked to its URI, the artist, `Playing · 0:34 / 5:44 · 80% volume ·
  loop off · 2 in queue`;
- up to five "up next" rows, then a count;
- one select with at most 25 options (`Jump to a queued track`);
- five buttons (`toggle`, `skip`, `shuffle`, `loop`, `stop`) and a volume row;
- a footer that says the read time and "the head is the current track".

The publisher (`apps/bot/src/music/panel.ts`) edits the same message, one
edit per 1.5 s, serialised so two state changes cannot race. A `30046` (unknown
message) posts a fresh card and stores the new id. The custom ids are the
repository's signed `k1:` ids with a 15-minute window, registered in
`apps/bot/src/music-interactions.ts`.

## The dashboard remote

`/dashboard/guilds/:id/music` is a remote, not a second player.

- It renders bot-published state plus a heartbeat. `reportedAt` older than 20 s
  means **Last known state, not live**: controls are disabled and `↻ Resume saved
  queue` is offered.
- It reads the durable row directly for the queue table, because the row is the
  queue even when no session exists.
- Every control is one POST to `/music/control`, CSRF-checked, guild-authorized,
  written as one `music.control` audit row, and forwarded over Redis. The bot
  answers with a message the browser shows; the bot also publishes state *before*
  it replies so the redirect does not render the pre-click snapshot.
- No browser ever holds a Discord token; channel pickers come from the web
  process's own directory read.

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `false` | Every command except `status` refuses while false |
| `maxTracks` | integer 1–500 | `100` | Cap enforced inside the store |
| `defaultVolume` | integer 0–200 | `80` | Applied when a player is created |
| `idleLeaveSeconds` | integer 10–600 | `45` | Leave voice after the queue empties |
| `djOnly` | boolean | `false` | When on, playback and queue controls need the DJ role |
| `djRoleIds` | string | `""` | Comma/space-separated role ids; parsed once, invalid entries dropped |

## Commands

14 subcommands, guild-only, two-second cooldown. `clear` always
requires `ManageGuild`. Playback and queue controls (`pause`, `resume`, `skip`,
`stop`, `volume`, `loop`, `shuffle`, `jump`, `remove`) pass the DJ gate, which
allows everyone while `music.djOnly` is off and otherwise requires
`Administrator`, `ManageGuild` or one of `music.djRoleIds`.

| Command | Behaviour |
| --- | --- |
| `/music status` | Module state, queue count, node name/version/ping and the exact blocker when unavailable. Works while disabled. |
| `/music play query` | Resolves and appends; starts the head when idle. `next:true` inserts at 2. |
| `/music add query` | Resolves and appends without starting. |
| `/music queue` | The saved queue, head marked current. |
| `/music remove position` | Removes one track; position 1 advances. |
| `/music clear` | Stops and empties, stays in voice. |
| `/music skip` | Advances past the head. |
| `/music stop` | Stops, empties and leaves voice. |
| `/music pause` / `resume` | Pauses, or continues from the same second. |
| `/music volume value` | 0–200, clamped. |
| `/music loop mode` | `off`, `track`, `queue`. |
| `/music shuffle` | Keeps the head, shuffles the rest. |
| `/music jump position` | Truncates to that position and plays it. |

## Manifest and intents

The manifest requests `Guilds` and `GuildVoiceStates`. The voice intent is used:
the bot joins and leaves channels. No message-content intent is requested.

## Where the code lives

- `packages/kernel/src/music.ts` — types, `MusicStore`, `MusicPlayback`,
  `MusicControlBus` request/state shapes, the `community_records` identity.
- `apps/bot/src/music/voice.ts` — `VoiceNode`, `VoicePlayer`, `VoiceTrack`.
- `apps/bot/src/music/shoukaku-node.ts` — the Shoukaku adapter and its options.
- `apps/bot/src/music/playback.ts` — `QueueMusicPlayback`, the state machine.
- `apps/bot/src/music/panel.ts` — the card publisher.
- `apps/bot/src/music-interactions.ts` — button and select routes.
- `apps/bot/src/music-control.ts` — dashboard handler, publisher, heartbeat.
- `packages/cache/src/music-bus.ts` — Redis request/reply and state keys.
- `packages/db/src/music-store.ts` — SQL queue over `community_records`.
- `modules/music/src/*` — service, validation, panel renderer, command.
- `apps/web/src/render.ts`, `routes/dashboard.ts` — the dashboard page.

## Non-goals

- Bundled or scraped sources, YouTube or Spotify plugins (licence and terms).
- Lyrics, autoplay, recommendations, karaoke, filters.
- A second queue table or a second player in the web process.
- Frame-accurate progress in the browser; the position is the node's last report.

## Verified by

`apps/bot/src/music/playback.test.ts`, `modules/music/src/panel.test.ts`,
`apps/bot/src/music-interactions.test.ts`, `apps/bot/src/music-control.test.ts`,
`apps/web/src/music-page.test.ts`, `packages/db/src/music-store.test.ts`, and the
live run recorded in [[04-Modules/music/Status|Status]].
