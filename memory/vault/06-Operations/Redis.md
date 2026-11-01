# Runbook — Postgres and Redis

P1 introduced two stateful services. Neither is optional in production, and
neither starts implicitly.

## First run

```bash
cp .env.example .env        # add DISCORD_TOKEN
docker compose up -d postgres redis
pnpm db:migrate             # explicit, idempotent
pnpm dev                    # bot
pnpm worker:dev             # second terminal; requires REDIS_URL
```

With compose, the `migrate` service runs once before `bot` and `worker` start,
and the bot waits for `condition: service_completed_successfully`. That ordering
is the point: two replicas never race migrations on boot.

## Modes

| Variable | Present | Absent |
| --- | --- | --- |
| `DATABASE_URL` | Settings in Postgres; `/setup` reports reachable/migrated | Settings in memory; reset on restart; warning at boot |
| `REDIS_URL` | Shared cooldowns; BullMQ queue + worker | Process-local cooldowns; jobs run in-process and are lost on restart |

`/setup` reports which mode is live. A configured but unreachable service is a
boot error, never a silent downgrade.

## Migrations

- Ordered, transactional, recorded in `schema_migrations`.
- Running twice is a no-op; the second run prints "already up to date".
- Applied migrations are never edited. A change is a new file (`0002_…`).
- Rollback is a redeploy of the previous code plus a forward migration; there
  are no down-migrations, so schema changes must be backwards-compatible for one
  release (expand → migrate → contract).

## Backups

- `pg_dump` on a schedule; test a restore into a scratch database monthly.
- Redis holds cooldowns and queue state, not the source of truth. Losing it
  resets cooldowns and drops queued jobs; Postgres receipts make redelivery safe
  but cannot resurrect a job that never ran.
- Never store ticket transcripts or cases only in Redis.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/setup` says database unreachable | `docker compose ps`, then the URL's host/port from inside the container |
| `/setup` says migrations pending | `pnpm db:migrate`; it prints the applied versions |
| Cooldowns not shared | Is `REDIS_URL` set? The boot log says `cooldowns: redis` or warns |
| Jobs never run | Worker is a separate process; `docker compose logs worker` |
| Job retried twice | Expected: delivery is at-least-once. Idempotency receipts make the side effect once; check `job_receipts.status` |
| Worker exits immediately | It refuses to start without both `DATABASE_URL` and `REDIS_URL`; with both set it pings Redis for up to five seconds before logging ready, so a closed port is an explicit unreachable error, not a false ready line |

## Security

- Do not publish 5432/6379 to the internet. The compose file maps them to the
  host for local development only; remove those mappings on a server.
- Use `sslmode=require` (or stricter) for a managed database.
- The Redis password belongs in the URL, and the URL belongs in `.env`.
