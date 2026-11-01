# Diagnostics — status

## Now

P0 complete.

- Manifest registered in `packages/module-catalog/src/index.ts` and re-exported by `apps/bot/src/modules.ts`.
- `/ping` replies with uptime; 3 s per-user cooldown.
- `/about` replies with an ephemeral embed read from guild settings.
- Six tests, no token required.

## Verified

```
pnpm test -- modules   # registry, budget, defaults, /ping, /about, formatter
pnpm budget            # 2/100, status OK
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
- P2: add `/help`, generated from the registry rather than hand-written.

## Teaching

See [[Teaching]].
