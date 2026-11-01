# Runbook — token leak

A Discord bot token is a password for every guild the bot is in. Treat a leak as
a total compromise, not an inconvenience.

## Detect

- GitHub secret scanning alert, or a token string in a diff/log/screenshot.
- Unexpected guild joins, DMs, or commands the team did not run.
- Discord emails about your application.

## Contain (in this order)

1. **Rotate the token** in the Developer Portal → Bot → Reset Token. Do this
   before investigating. The old token dies immediately.
2. **Update the secret** in every environment (production, staging, local `.env`
   for whoever needs it) and redeploy.
3. **Audit the window.** Guild audit log for bot actions: bans, channel deletes,
   role edits, webhook creation, invites. Export it.
4. **Check for persistence.** New webhooks, new bot-added roles, modified
   permissions, new application commands, a changed interaction endpoint.
5. **Notify** affected server owners with the window and what was checked.

## If the token was committed

Rotating is not enough — the token is in git history and in every clone:

- Rewrite history only with the owner's explicit approval; it is disruptive.
- Assume the token is public forever, even after rotation. Rotate first.
- Add the file pattern to `.gitignore` and a pre-commit secret scan.

## Prevention

- `.env` is gitignored; `.env.example` holds only empty keys.
- No token in logs: the logger never receives `env`, only derived fields.
- No token in error messages: `UserError` exists so internal details stay internal.
- One token per environment. Never share production's token with a dev machine.
- Rotate on any team member departure.

## Blame

None. The postmortem asks why a token could reach that surface, not who typed it.
