# Music — status

## Now

Music plays. One Lavalink 4.2.2 node owns the Discord voice socket and DAVE; the
bot owns one durable queue and one signed card; the dashboard starts and controls
the same player. There is no second player, no second queue and no bundled
scraper.

- **One engine behind the port.** `QueueMusicPlayback`
  (`apps/bot/src/music/playback.ts`) implements the kernel `MusicPlayback` port.
  `ShoukakuNode` (`apps/bot/src/music/shoukaku-node.ts`) is the only file that
  imports Shoukaku or discord.js; `packages/kernel/src/music.ts` still imports
  neither.
- **The durable queue is the play queue.** `community_records`, kind
  `music_queue`, key `default`, holds the ordered tracks. `tracks[0]` is the
  current track and leaves the row only when it ends or is skipped. No table and
  no migration were added.
- **One signed card.** `modules/music/src/panel.ts` renders a Components V2
  panel: accent by state, progress, artist and length, up to five "up next" rows,
  a jump select over 25 tracks, five buttons and a volume row. The publisher
  edits one message, serialises edits and throttles them to one per 1.5 s; a
  Discord `30046` posts a fresh card.
- **The dashboard is a remote.** `apps/web/src/render.ts` renders only
  bot-published state, a 20-second heartbeat and the durable row; every control
  is one POST through Redis (`packages/cache/src/music-bus.ts`) to the bot, and
  each accepted control appends one `music.control` audit row. A report older
  than 20 s is labelled **Last known state, not live** and its controls are
  disabled.
- **14 subcommands.** `/music` has `play`, `add`, `queue`, `remove`, `clear`,
  `skip`, `stop`, `pause`, `resume`, `volume`, `loop`, `shuffle`, `jump` and
  `status`. The registry ledger is **20 roots / 147 subcommands / 167 actions /
  4 context menus**; the music root itself costs no extra slot.
- **Optional, and honest about it.** Music is disabled per guild by default. A
  build with no `LAVALINK_URL` refuses every play with the exact missing
  configuration and keeps the saved queue working.

```bash
docker compose up -d lavalink     # the bundled node, 4.2.2
pnpm start                        # bot
pnpm web:start                    # dashboard on WEB_PORT
```

`.env.example` ships the four `LAVALINK_*` defaults uncommented because the
documented quickstart starts that node. Delete them to run save-only; the
refusal names the fix.

## How the queue behaves

| Action | Durable row | Player |
| --- | --- | --- |
| `play query` with an idle session | appends, then the head starts | joins voice, plays `tracks[0]` |
| `play query` while a session is live | appends at the end | keeps playing; card shows the new position |
| `add` | appends | unchanged |
| `play` with `next:true` | inserts at position 2 | unchanged |
| `skip` | drops the head | starts the new head |
| `pause` / `resume` | unchanged | pauses, then continues from the same second |
| `loop:track` | unchanged | an ended track replays; an explicit `skip` still advances |
| `loop:queue` | head rotates to the end | an ended track starts the new head |
| `shuffle` | head kept, the rest shuffled | unchanged |
| `jump n` | keeps `tracks[n-1..]` | starts the new head |
| `remove 1` | same as `skip` | advances |
| `remove n` | drops position `n` | unchanged |
| `clear` | row deleted | player stopped, stays in voice |
| `stop` | row deleted | player destroyed, leaves voice |
| bot restart | row survives | nothing plays; `↻ Resume saved queue` starts from the head at `0:00` |

A restart resumes the **queue**, not the position. Lavalink's session resume
covers a short node or gateway disconnect, not a new bot process; the page says
so instead of pretending the old second survived.

## Verified

```text
pnpm typecheck                         pass
pnpm test                              850 tests / 115 files
pnpm budget                            20/100 roots · 147 subcommands · 167 actions
pnpm audit:claims                      35/35
pnpm audit:visuals                     360 checks · 27 surfaces
pnpm memory:check                      pass
```

Token-free tests that pin this behaviour:

- `apps/bot/src/music/playback.test.ts` — head semantics, append, loop track and
  queue, shuffle with the head kept, jump truncation, remove 1 as skip, stop and
  clear, three-failure parking, idle leave.
- `modules/music/src/panel.test.ts` — the card's 40/4,000 budget, the five button
  labels, the jump select and the "progress is not a timer" footer.
- `apps/bot/src/music-interactions.test.ts` — the signed custom-id routes and the
  guild/DJ checks.
- `apps/bot/src/music-control.test.ts` — the dashboard handler, the disabled
  refusal, value validation, and `Queued at position N.` for an append.
- `apps/web/src/music-page.test.ts` — CSRF on every control, no HTML injection,
  the unpause control, the stale page with no `now` pill.
- `packages/db/src/music-store.test.ts` — PGlite: one raw `community_records` row,
  the cap under five concurrent adds, guild isolation.

## Live run, 2026-11-06

Guild `1450130465146142785`, bot AI Team#5758, node `main` at 17–24 ms, track
`https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3` (Songs 2–5 for
the queue order). Every control was driven from the dashboard in a real browser;
the Discord side was read back over REST.

```text
Lavalink /v4/loadtracks   loadType=track · sourceName=http · length=372715
                          title="Unknown title"   ← the http source has no tag reader
Dashboard Play            "Started playback."
                          queue row 1 = SoundHelix Song 1
                          /v4/stats players:1 playingPlayers:1
                          card 0:14 / 6:12 · artist SoundHelix · Node main 24ms
Pause                     "Paused." · pill paused · control ▶ Resume
                          /v4/stats playingPlayers:0
Resume (unpause)          "Resumed." · pill playing · position 0:06  ← continued
Bot restart               "Last known state, not live." · controls disabled
                          "↻ Resume saved queue"
Resume saved queue        "Resumed the queue." · Song 1 at 0:00 from the head
Play Song 3               "Queued at position 3." · row Song 1 | Song 2 | Song 3
Skip                      row Song 2 | Song 3 · Song 2 playing · Song 1 gone
Loop track → Skip         published loop:"track" · row Song 3  ← skip still advanced
Shuffle (3 tracks)        row Song 3 | Song 5 | Song 4  ← head kept, rest swapped
Remove position 2         "Removed SoundHelix Song 5." · row Song 3 | Song 4
Stop                      "Stopped and disconnected." · row count 0
                          /v4/stats players:0 · published state:"idle"
```

The filename fallback is why the card says **SoundHelix Song 1** and not the
node's `Unknown title`: a bare mp3 carries no tags, and a card that repeats
"Unknown title" for every track is worse than the file name.

Discord read-back of channel `1450130466089730213`: the newest card is a
Components V2 message (`type 17` container with an accent colour), five buttons
whose signed ids carry `music:toggle`, `music:skip`, `music:shuffle`,
`music:loop` and `music:stop`, a volume row, and a signed `music:jump` select
whose options listed `2. SoundHelix Song 4`. The newest card reads
`edited: true`, which proves at least one in-place edit succeeded during the run
(not a per-step message id history), and the paused card in the same channel
reads `Paused · 0:29 / 6:12 · 80% volume · loop off`.

### What the proof does and does not cover

- **Exercised for real**: Lavalink 4.2.2 over HTTP, the Postgres queue, the Redis
  bus, browser POSTs with CSRF, and Discord REST read-back of the card.
- **Unit-tested only**: loop-track replay at the end of a track, `LOAD_FAILED`
  parking after three advances, the `30046` re-post, and DAVE negotiation.
- **Not proven**: anything audible. No human joined the channel; `playingPlayers:
  1` proves the node encoded and sent frames, not that a person heard them. No
  slash command and no Discord button was invoked in this run: the MCP server can
  read rich messages but cannot click, and it could not send messages.
- **Known limit**: a bot restart re-resolves the head, so playback resumes at
  `0:00`. The card and this page say that plainly.

## Known limitations

- No source plugin: direct http(s) audio only. YouTube and Spotify stay out for
  licence and terms reasons; `music.bundled-source` is a non-goal.
- One node. `moveOnDisconnect` is configured but an unfilled second node cannot
  move anywhere.
- The dashboard needs `REDIS_URL` on both processes and
  `DISCORD_TOKEN` on the web process for the channel pickers; without them it is
  read-only and says which one is missing.
- Progress is the node's last report, refreshed by the 5 s publisher, not a
  browser timer.

## Next

- A human listener confirms audible output, and a real client clicks one card
  button; those two proofs promote `gap.music-playback` from partial to covered.
- A second Lavalink service in compose to exercise `moveOnDisconnect`.
- A `/music seek` subcommand only if the card can show the result honestly.
