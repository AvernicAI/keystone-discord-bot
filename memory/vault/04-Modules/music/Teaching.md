# Music — teaching notes

## Read in this order

1. `packages/kernel/src/music.ts` — the queue types, `MusicStore`, the
   `MusicPlayback` port, the dashboard request/state shapes and the stable
   `community_records` identity. Nothing here imports discord.js or Shoukaku.
2. `apps/bot/src/music/voice.ts` — the four-method `VoiceNode` seam
   (`join`, `resolve`, `leave`, `status`) and the `VoicePlayer` events.
3. `apps/bot/src/music/shoukaku-node.ts` — the only adapter that knows Shoukaku;
   read the constructor options and the comment above them.
4. `apps/bot/src/music/playback.ts` — `QueueMusicPlayback`. This is the state
   machine: the head is the current track, `#advance` owns end-of-track, and the
   session lock serialises every control.
5. `modules/music/src/panel.ts` — one pure card renderer; budget and labels are
   tested without a gateway.
6. `apps/bot/src/music/panel.ts` — the publisher: one message, a 1.5 s throttle,
   a `30046` fallback.
7. `apps/bot/src/music-control.ts` and `packages/cache/src/music-bus.ts` — the
   dashboard request/reply and the state the page reads.
8. `apps/web/src/render.ts` (`renderMusic`) and
   `apps/web/src/routes/dashboard.ts` (`musicPage`, `musicControl`).
9. `apps/bot/src/music/playback.test.ts` — how the semantics are pinned without a
   node.

## The idea to take away

**A music bot is three separate problems, and mixing them is what breaks it.**

1. **Transport.** Who owns the Discord voice socket, the UDP handshake, opus and
   end-to-end encryption (DAVE)? Discord enforces DAVE for server voice from
   2026-03-01 (R-048). `@discordjs/voice` answers this by implementing it in
   Node — native opus, native encryption, one more thing to install and patch.
   Lavalink 4.2.0 added DAVE (R-047), so the node answers it and the bot sends
   and receives WebSocket messages. That is why there is no `@discordjs/voice`
   dependency here: `ShoukakuNode` is a thin connector and
   `QueueMusicPlayback` never sees a voice packet.
2. **Queue state.** Who decides what plays next, and what survives a restart? A
   player library usually keeps an in-memory queue that dies with the process.
   Keystone makes the durable row the queue, with `tracks[0]` as the current
   track. The player is then a projection of the row, not a second source of
   truth. That is why `skip` can be implemented as "delete the head, start the
   new head" and a crash between those two steps leaves exactly one row state
   that a restart can resume.
3. **Presentation.** How often do you edit a message? Discord's per-message edit
   budget is small, and a progress bar that ticks every second is a rate-limit
   generator. The card updates on state changes (start, pause, skip, volume,
   loop), is throttled to one edit per 1.5 s, and says "Progress is the node's
   last report, not a timer." A 429 is treated as a signal to skip an edit, not
   to retry harder.

The second idea to take away is **configure defaults that survive reality, not
the library's demo**. Shoukaku's defaults are `resume: false`, three reconnect
tries and `moveOnDisconnect: false`. For a self-hosted bot whose node lives in
the same compose file, all three are wrong: a gateway reconnect should not stop
the music, a node restart deserves more than three tries, and a second node
should be able to take the player. The constructor in `shoukaku-node.ts` sets
`resume: true`, a 60 s resume window, ten tries at 5 s, a 10 s REST timeout, a
15 s voice-connection timeout and `moveOnDisconnect: true`. Every one of those
is a claim about failure behaviour, so each is named where it is set.

## The queue semantics, in one table

| You do | Row | Player |
| --- | --- | --- |
| `play` while idle | append, then head plays | join, play head |
| `play` while live | append | keep playing |
| `skip` | drop the head | start the new head |
| track ends, loop off | drop the head | start the new head |
| track ends, loop track | unchanged | replay the head |
| track ends, loop queue | head moves to the end | start the new head |
| `shuffle` | head kept, the rest shuffled | unchanged |
| `jump 3` | keep `tracks[2..]` | start the new head |
| `clear` | row deleted | stop, stay in voice |
| `stop` | row deleted | destroy, leave voice |
| `remove 1` | same as skip | advance |

Two subtleties worth reading twice:

- **`skip` ignores loop-track.** A caller who asks to leave a track must not be
  trapped on it by the loop setting; `#advance(session, false)` exists for that.
- **`jump` writes first, then plays.** Truncating the row before starting means
  a crash cannot resurrect the tracks the user skipped past.

## Exercise

Make a restart resume the *second*, not just the head — without lying.

1. Add an optional `resumePositionMs` to the queue row, written by the publisher
   every five seconds while a track plays.
2. On `resume`, start the head at that position only if it is within the track's
   length and the row's `updatedAt` is younger than one minute.
3. Show the position on the card only when the bot actually started there, and
   say "started at the saved position" in the reply.
4. Write the test that fails when the saved position is stale: the player must
   start at `0:00` and the reply must say so.

The rule is not "resume exactly"; it is "never claim a position the node did not
start at."

```bash
pnpm test -- apps/bot/src/music/playback.test.ts
pnpm audit:visuals
```

## What we rejected

- **`@discordjs/voice` plus a resolver.** Duplicates transport, adds native
  dependencies, and still has to solve "where does the audio come from". The
  node does both.
- **Ticking the progress bar every second.** One edit per second per guild is a
  guaranteed 429, and the position would still be the node's last report.
- **Persisting the encoded track.** A 100-track row would grow by roughly 20×
  for a resume that still cannot cross a process boundary.
- **A `currentIndex` column.** It can disagree with the row's order. The head is
  the index.
- **Auto-resuming at boot.** A new process has no voice connection; showing
  "playing" would be a fabricated state.
- **YouTube or Spotify plugins.** Licence and terms risk; direct http(s) sources
  are the supported, documented path.

## Check yourself

1. Why does `tracks[0]` survive while the track plays, instead of being removed
   when it starts?
2. What happens to the durable row if the bot crashes between `skip` deleting the
   head and the new head starting? Which invariant makes that safe?
3. Shoukaku defaults `resume` to false. What user-visible failure does that cause
   in a self-hosted compose stack, and which option fixes it?
4. You want a "seek" button. Which of the three problems (transport, queue,
   presentation) owns the seek, and what must the card say before a person can
   trust it?
5. Why does the dashboard disable its controls when `reportedAt` is older than
   20 seconds, even though the bot's heartbeat is still fresh?
