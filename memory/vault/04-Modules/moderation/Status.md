# Moderation & security — status

## Now

P2 core shipped in pass 05 (2026-11-01).

- Cases, case events and atomic per-guild numbering are wired to Postgres.
- `/mod` supports ban, kick, timeout, warn, purge, lock/unlock, slowmode, case,
  note, history and review.
- The scanner handles invites, mention spam and duplicates; anti-raid,
  anti-nuke and the join gate feed the same case coordinator.
- `/appeal` and the case-button appeal path add events; `/verify` clears
  quarantine.
- Native AutoMod rules are built and synced only when explicitly enabled.
- Dry-run is the default and produces alerts/cases without punitive calls.

## Verified

```
pnpm test                                  # 70 tests / 13 files, 13 suites
pnpm test -- modules/moderation            # 12 tests: raid, dry-run, /mod, appeal, verify, native plan
pnpm test -- packages/db/src/cases.test.ts # 2 PGlite case-store tests
pnpm budget                                # 6/100, status OK
pnpm build                                 # bot, worker, migrate artefacts
```

P2 exit evidence:

- `security.test.ts` scripts **10 joins, 5 invite posts and one webhook**. In
  enforcing mode it records 20 cases and makes 11 quarantine, 5 delete-message,
  1 delete-webhook and 1 timeout calls. Every case has a reason and an appeal
  button in its notification.
- The same script under defaults makes **zero punitive calls**; every resulting
  case is `alerted`, not open enforcement.
- `/mod` creates a case before a ban and asserts the reason and appeal custom id.
  Its default dry-run creates no case and calls no action. A missing reason
  throws. A caller without `ModerateMembers` is blocked by dispatch.
- `/appeal` only accepts the target's own case and appends an `appealed` event.
  `/verify` calls the same quarantine action the button uses.
- `DrizzleCaseStore` allocates 1..8 without duplicates under `Promise.all` on
  PGlite, persists cases/events/state and isolates guilds.

## Proven vs still needs a live gateway

| Claim | Proven here? | How to close |
| --- | --- | --- |
| Scripted raid is contained | Yes, policy engine + coordinator | Replay in a staging guild with a real token |
| Every action has a case/reason/appeal | Yes, fake action recorder and case store | Same |
| Dry-run makes no punitive call | Yes | Same |
| Postgres case numbering/events | Yes, PGlite | Run against a Postgres server |
| Discord ban/kick/timeout/purge/lock | No | A live guild with the bot's permissions |
| Native AutoMod sync | Plan tested; adapter not run | Enable `nativeAutoMod.sync` in staging |
| Gateway joins/messages/audit events | Adapter typechecks; not run | A live guild with privileged intents |
| Join-gate timeout expiry | Not wired | Scheduled job; see known limitations |

No document claims a live Discord run for the unproven rows.

## Known limitations

- `joinGate.timeoutMinutes` is stored and shown, but no expiry job yet; a
  quarantined member stays until `/verify` or a moderator acts.
- Temporary bans and temporary roles are not separate actions yet. The case
  model is ready for an expiry job; P2's exit demo does not require it.
- Case export (JSON/CSV) is not built; the ledger is queryable and P5 owns the
  full export surface.
- Panic mode is not a command yet. Anti-raid applies the same containment
  decisions automatically.
- `/appeal` is guild-only; DM and web appeals need P3/P5 surfaces.
- Native AutoMod deletes only prefixed rules; a server's own rules are untouched.
- Live Discord API calls, button interactions and gateway events are unverified.

## Next

- Staging run with a token: replay joins/messages/webhook and record receipts.
- Add the join-gate expiry job and temp-ban/temp-role expiry on the worker.
- P3: link tickets and levels to the same case/case-event service.

## Teaching

See [[Teaching]].
