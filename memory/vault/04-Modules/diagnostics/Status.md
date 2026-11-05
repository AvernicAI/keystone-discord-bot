# Diagnostics — status

## Now

P0 complete; `/help` added in pass 26; the server-aware hub landed in pass 75.

- Manifest registered in `packages/module-catalog/src/index.ts` and re-exported by `apps/bot/src/modules.ts`.
- `/ping` replies with uptime; 3 s per-user cooldown.
- `/about` replies with an ephemeral embed read from guild settings.
- `/help` exposes `browse`, `commands`, `search`, `privacy` and `changelog` from
  the live registry catalog. Live 2026-11-01: `!help commands`, `!help browse`
  and `!help search query=ban` returned the catalog, module map and one hit.
- Since the context menus landed (pass 33), `/help` filters them out of the
  text catalog — they are not slash roots — and adds one sentence pointing at
  right-click → Apps. The generated catalog keeps a separate menu table.
- Pass 43 made `changelog` read `../changelog.ts` instead of a hard-coded pass
  26. `audit:claims` fails when the first entry is not the latest pass in
  `memory/machine/passes.json`, so the command cannot silently go stale again.
- Pass 62 put `/ping`, `/about` and `/help` reply and embed copy in
  `packages/i18n`: the guild's `setup.locale` selects the German catalog and a
  missing key falls back to English, never to the key. The command
  descriptions come from the registry and the German copy lives in `de.ts`
  (pass 63 removed the English mirror), so a new option without German fails
  the coverage test.
- Pass 75 replaced the guild embed with a V2 hub: modules on/off, open
tickets, open cases only with `ModerateMembers`, database/cache health and the
live registry totals. The module picker and the Overview, privacy and changelog
buttons are signed 15-minute ids routed from `apps/bot/src/help-interactions.ts`;
each update re-reads facts and re-mints the controls. A DM keeps the flat card.
- The development bridge now sends through the interaction adapter, so `!help`
shows the same V2 panel to the MCP instead of a flattened message.
- Tests: 13 command cases, 12 pure panel cases and 5 route cases, no token
required.

## Verified

```
pnpm exec vitest run modules/diagnostics apps/bot/src/help-interactions.test.ts
pnpm budget            # 3/100 roots for this module, status OK
```

## Known limitations

- Settings flow through `ctx.settings`, so the deployment's repository decides
  where they live. Postgres is used when `DATABASE_URL` is set; the process-local
  repository is only the P0/P1 fallback and resets on restart.
- `/ping` reports process uptime, not gateway latency. Gateway ping needs a
  websocket handle the kernel deliberately does not expose yet.
- `detailed` is declared but unused. It exists to prove that adding a setting is
  a schema change plus a default, nothing more.
- A human button press through a gateway is not claimed. The route, signature,
expiry and update body are exercised through the real adapter fake.
- Ticket and case counts are lower bounds: a store that fills the 100-row query
  limit prints `100+` rather than a total it cannot prove.

## Next

- P1: read `enabled` in dispatch (module toggles are a kernel concern, not a
  per-command check).
- P1: add gateway latency once `client.ws.ping` is passed through a kernel port.
- P7.5: live-prove one module pick and one Overview press with a human client.
- P8: add fuzzy search inside the hub if `/help search` proves too coarse.
- P7: context-menu entries now live in moderation, community and AI; `/help`
  points at them instead of inventing slash roots for them.

## Teaching

See [[Teaching]].
