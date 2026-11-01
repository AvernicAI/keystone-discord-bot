# Diagnostics — status

## Now

P0 complete; `/help` added in pass 26.

- Manifest registered in `packages/module-catalog/src/index.ts` and re-exported by `apps/bot/src/modules.ts`.
- `/ping` replies with uptime; 3 s per-user cooldown.
- `/about` replies with an ephemeral embed read from guild settings.
- `/help` exposes `browse`, `commands`, `search`, `privacy` and `changelog` from
  the live registry catalog. Live 2026-11-01: `!help commands`, `!help browse`
  and `!help search query=ban` returned the catalog, module map and one hit.
- Since the context menus landed (pass 33), `/help` filters them out of the
  text catalog — they are not slash roots — and adds one sentence pointing at
  right-click → Apps. The generated catalog keeps a separate menu table.
- Eight tests, no token required.

## Verified

```
pnpm test -- modules   # registry, budget, defaults, /ping, /about, /help, formatter
pnpm budget            # 3/100 roots for this module, status OK
```

## Known limitations

- Settings are in memory, so they reset on restart. This is P0 by design; P1
  swaps the repository, not the module.
- `/ping` reports process uptime, not gateway latency. Gateway ping needs a
  websocket handle the kernel deliberately does not expose yet.
- `detailed` is declared but unused. It exists to prove that adding a setting is
  a schema change plus a default, nothing more.

## Next

- P1: read `enabled` in dispatch (module toggles are a kernel concern, not a
  per-command check).
- P1: add gateway latency once `client.ws.ping` is passed through a kernel port.
- P7: add schema-driven help panels if the embed field limit becomes tight.
- P7: context-menu entries now live in moderation, community and AI; `/help`
  points at them instead of inventing slash roots for them.

## Teaching

See [[Teaching]].
