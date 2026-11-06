# Lesson 16 — One player, not two

**Code:** `apps/bot/src/music/playback.ts`, `apps/bot/src/music/shoukaku-node.ts`,
`modules/music/src/panel.ts`, `apps/web/src/render.ts`

## The problem

You add music. The easy version works on your laptop: a queue array in memory, a
`play` command that resolves a URL, a `skip` button. Then four things happen, in
this order, to every bot that gets popular:

1. The process restarts during a deploy and the queue is gone. Someone had 40
   tracks queued and now has none.
2. Two people press Skip at the same time and the "current track" is now
   whichever handler ran last — sometimes a track that already ended.
3. The progress bar is updated with `setInterval(…, 1000)`. Discord starts
   answering 429, and the bot's other replies slow down too.
4. Somebody adds a dashboard with a second "play" button, and now two processes
   both believe they own the player.

None of these are audio problems. They are state-ownership problems. If you get
the ownership right, the audio part is a library call.

## Our version

**One port, one adapter, one owner.** Every capability is behind
`MusicPlayback`; the only implementation is `QueueMusicPlayback`; the only
process that constructs it is the bot. The dashboard has no player at all — it
sends a request over Redis and renders the state the bot publishes. The global
command ledger holds 20 roots; `/music` is one of them, and its 14 subcommands
cost no further slots.

```ts
// packages/kernel/src/music.ts — the port has no discord.js in scope
export interface MusicPlayback {
  status(): Promise<MusicPlaybackStatus>;
  play(input: MusicPlayInput): Promise<MusicPlaybackResult>;
  resume(input: MusicResumeInput): Promise<MusicPlaybackResult>;
  pause(guildId: string, paused: boolean): Promise<MusicPlaybackResult>;
  skip(guildId: string): Promise<MusicPlaybackResult>;
  // … setVolume, setLoop, shuffle, jump, remove, clear, stop, snapshot
}
```

**The durable row is the queue.** `community_records` (kind `music_queue`) holds
`tracks[]`, and `tracks[0]` is the current track until it ends or is skipped.

```ts
// apps/bot/src/music/playback.ts
async #advance(session: Session): Promise<MusicPlaybackResult> {
  const queue = await this.store.list(session.guildId);
  if (queue.tracks.length === 0) { /* idle */ }
  if (session.loop === "track" && session.encoded) {
    await session.player.play(session.encoded); // rewind, row untouched
    return { ok: true, track: session.current };
  }
  if (session.loop === "queue") {
    await this.store.replace(guildId, [...rest, head]); // rotate the head
  } else {
    await this.store.shift(guildId);                   // drop the head
  }
  return this.#startHead(session, await this.#settings(guildId));
}
```

The invariant that makes a crash safe is small: **the row is always a valid queue
on its own**. It never contains a "currently playing" marker that can disagree
with the player; the head is the current track. A crash before `shift` replays
the track that was playing. A crash after `shift` starts the next one. There is
no third state to repair.

**Serialise the session, not the HTTP handler.** Every mutating call goes through
one promise chain per guild:

```ts
async #exclusive<T>(session: Session, fn: () => Promise<T>): Promise<T> {
  const run = session.lock.then(fn, fn);
  session.lock = run.then(() => undefined, () => undefined);
  return run;
}
```

Two people pressing Skip now queue behind each other. The second sees the row the
first left behind, so it skips the *next* track rather than skipping one twice.

**One message, edited on state change.** The card is published by
`apps/bot/src/music/panel.ts`:

```ts
// one edit per 1.5 s, serialised; a 30046 posts a fresh card
if (Date.now() - this.lastEdit < 1500) { this.pending = input; return; }
```

Discord's edit budget is per message and shared with every other reply your bot
sends. A progress bar that ticks once per second spends it all. The card says
"Progress is the node's last report, not a timer" because that is true: the
position comes from Lavalink's player, not from the browser's clock.

**Configure for failure, not for the demo.** Shoukaku's defaults are
`resume: false`, three reconnect tries and `moveOnDisconnect: false`. In a
compose stack where the node restarts beside the bot, those defaults stop the
music. The adapter sets `resume: true` with a 60 s window, ten tries at 5 s, and
`moveOnDisconnect: true` — each one a statement about what should happen when
something dies.

## Exercise

Add a `seek` subcommand and a Seek control, without letting the card lie.

1. Add `seek(guildId, positionMs)` to `MusicPlayback` and implement it in
   `QueueMusicPlayback` behind the session lock.
2. Reject a position past `track.durationMs` and a stream (`isStream`), with a
   message that names the limit.
3. Republish the card only after the node acknowledges the seek; the progress bar
   must not move before that.
4. Add a `music:seek` button that seeks ±30 s, and make the interaction route
   check the same guild and DJ gate as the other buttons.
5. Write the test that fails when the card shows the new position but the fake
   player refused the seek.

Then answer: which of the three problems (transport, queue, presentation) owns
the seek, and why does the answer change what you test?

```bash
pnpm test -- apps/bot/src/music/playback.test.ts apps/bot/src/music-interactions.test.ts
pnpm audit:visuals
```

## What we rejected

- **`@discordjs/voice`.** It owns the voice socket in Node, which means native
  opus and native DAVE. Lavalink 4.2 already implements DAVE, and Discord
  enforces it for server voice from 2026-03-01. One transport owner, not two.
- **An in-memory queue with periodic saves.** Two sources of truth and a window
  where they disagree. The row *is* the queue.
- **A `currentIndex` field.** It can point at the wrong track after a concurrent
  skip. The head is the index.
- **Editing the card every second.** It spends the bot's whole edit budget on a
  number nobody needs to the second.
- **A dashboard player.** Two players is the bug this lesson exists to prevent;
  the dashboard is a remote that writes a request and reads a snapshot.
- **Auto-resume after a restart.** There is no voice connection, so "playing"
  would be fabricated. Show last-known state and offer an explicit resume.

## Check yourself

1. Where exactly does `skip` mutate the durable row, and what does a crash
   between the mutation and `#startHead` leave behind?
2. Why is `skip` implemented with `#advance(session, false)` instead of the
   normal end-of-track path?
3. The dashboard polls nothing; it renders a published snapshot. What does the
   20-second freshness rule protect a user from seeing?
4. Your card edit is rate-limited. Which state changes must still publish
   immediately, and which can wait 1.5 s?
5. Name the two proofs a live run cannot produce without a human, and why
   `playingPlayers: 1` is not one of them.
