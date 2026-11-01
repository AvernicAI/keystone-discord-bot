# Music — teaching notes

## Read in this order

1. `packages/kernel/src/music.ts` — the queue types, the one `MusicStore` port,
   the `MusicPlayback` seam and the stable `community_records` identity. Note
   that nothing here imports discord.js or Drizzle.
2. `modules/music/src/playback.ts` — the whole unavailable adapter. It is short
   on purpose: a refusal is a result, not an exception.
3. `modules/music/src/music.ts` — settings, URL validation, the disabled policy
   and how a playback refusal becomes a user-facing `UserError`.
4. `modules/music/src/store.ts` — the per-guild promise chain that makes
   concurrent adds safe in memory.
5. `packages/db/src/music-store.ts` — the same rules in SQL, with a guild row
   lock instead of a promise chain.
6. `modules/music/src/commands/music.ts` — guards, permission checks and the
   eight render branches.
7. `packages/db/src/music-store.test.ts` — the raw `community_records` query and
   the concurrent cap test.

## The idea to take away

**A capability you cannot back is a seam plus an honest refusal, not a mock.**

The tempting shortcut is a `play` command that replies "Now playing: …" and a
queue that says "1 track playing". It demos well and is a lie: no audio leaves
the process, and every later feature (skip, stop, now-playing) inherits the lie.

The structure that avoids it is small. Define the playback interface in the
kernel. Ship exactly one adapter. Make that adapter return `ok: false` with the
missing pieces named. Have the command layer propagate the reason instead of
inventing a success. When a real Lavalink adapter arrives, it implements the
same four methods and not one command changes.

The second idea is **the queue is data, not playback state**. Tracks are rows
with an id, a URL, a label and who asked. There is no `currentIndex`, no
`positionSeconds`, no `isPlaying`. Those are properties of a player, and putting
them in the saved row would make the database claim something the process cannot
know.

The third idea is **enforce limits in the store**. The command validates the URL
and the settings supplies the cap, but only the store can make "check the length
then append" atomic. The in-memory and SQL adapters use different primitives —
a promise chain and a row lock — for the same guarantee, and a concurrency test
holds both to it.

## An exercise

Add a `duration` only when a backend can supply it.

1. Add an optional `durationMs` to a *separate* playback status type, not to
   `MusicTrack`. The saved queue did not measure it.
2. Have the Lavalink adapter fill it from the track info it receives.
3. Render it in `status`, and only there.
4. Write a test with a fake playback adapter that returns a duration and one
   that returns `undefined`; both must render without inventing a number.

If you find yourself writing `durationMs: 0` as a default on a saved track, stop:
zero is a claim, and it is wrong.

## The mistakes you will probably make

- **Treating `enabled: false` as "hide the module".** `status` still answers, so
  an operator can see what is installed and how to turn it on. Silencing the
  command entirely makes the bot look broken.
- **Letting a playback refusal throw from the adapter.** Refusals are normal
  results (`ok: false`); only `UserError` reaches the member. An exception from
  a future client should become a named error, not a silent skip.
- **Locking on the wrong row in SQL.** The guild row is the existing lock target.
  Adding a `music_locks` table would be a second source of truth for
  serialization.
- **Assuming a URL is an audio file.** The module validates scheme and shape,
  not content type. A future player must handle a non-audio response; the queue
  does not fetch the URL.
- **Adding `GuildVoiceStates` "just in case".** An intent you do not use is a
  permission prompt and a review flag. Add it with the voice client.
- **Reporting the in-memory queue as a `community_records` row.** The status line
  is mode-neutral for that reason: in memory mode there is no SQL row, and the
  page says so.

## Stretch

Write a `LavalinkMusicPlayback` against a local Lavalink container and keep the
tests token-free with a fake HTTP server. Prove two things: `status` becomes
`available: true` only after a successful node handshake, and `play` returns
`ok: false` with the node's error when the node is down. Then explain why the
queue store needed no change at all.
