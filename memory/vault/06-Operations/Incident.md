# Runbook — incident

## Severity

| Sev | Definition | Response |
| --- | --- | --- |
| 1 | Bot offline, or destructive actions firing wrongly | All hands, mitigate first |
| 2 | A major module broken (moderation, tickets) | Mitigate within the hour |
| 3 | Degraded: latency, one feed, one dashboard page | Next working block |
| 4 | Cosmetic | Normal queue |

## First five minutes

1. **Stop the bleeding.** If the bot is punishing members wrongly, disable the
   module or set it to alert-only. A wrong ban is worse than a missing feature.
2. **Check the obvious.** Token valid? Gateway session up? Rate-limit 429s?
   Database reachable? Recent deploy?
3. **Write the timestamp.** `T0` goes in the incident doc, and every later note is
   relative to it. Memory of a timeline is unreliable.
4. **Say something.** Post in the support server: what is affected, what is not,
   when the next update is. Silence is read as abandonment.

## Mitigation order

1. Roll back the last deploy (see [[Release]]).
2. Disable the offending module via config, not by editing code.
3. Raise rate limits / add capacity only if the cause is load, not a bug.
4. Never "fix forward" during a Sev 1 unless the rollback is impossible.

## The invalid-request trap

10,000 invalid requests in 10 minutes gets the IP temporarily banned by
Cloudflare. 401/403/429 all count. If you see 403s climbing, stop the loop
*first* — a restart is fine, a retry storm is not.

## Postmortem (within 48 h)

Blameless, and specific:

- Timeline with T0.
- **Trigger** (the change) vs **root cause** (why the change could do that).
- What the monitoring showed, and what it should have shown.
- One action with an owner and a date. Not five aspirational ones.
- Update the relevant runbook or add a test — if the same class of incident can
  happen again, the postmortem is not finished.

File it in `memory/journal/` and link it from the next pass.
