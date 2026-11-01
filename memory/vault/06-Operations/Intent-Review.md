# Runbook — privileged intent review

Discord gates three intents: **Guild Members**, **Guild Presences** and
**Message Content**. Below 10,000 users you can self-enable in the portal. At or
above it, you get 90 days to apply, and **reviewed access must be renewed
annually**.

## Our position

We ask for the minimum, and every request has a fallback.

| Intent | Needed for | Fallback if denied |
| --- | --- | --- |
| Guild Members | Join/leave events, member count accuracy, role persistence, anti-raid joins | Fetch members on demand; welcome messages only on join events we do receive; count from cache |
| Message Content | Prefix commands, AI that reads chat, link/phishing scanning | Slash-first; AI mention-only (mention scope exempts content); scan only reported messages |
| Guild Presences | Rich presence features (probably never worth it) | Drop the feature |

## Writing the application

Discord rejects "my bot needs message content" as a justification. What works:

1. **The specific behaviour**, in one sentence: "Scans messages for phishing
   links and quarantines the author's roles, because compromised accounts
   mass-DM invite links."
2. **Why interactions cannot do it**: "A scam link posted by a compromised
   account does not invoke a slash command; the message must be read as it
   arrives."
3. **What is stored, where, and for how long**: "Message text is held in memory
   for classification and not persisted; only the case record (IDs, rule,
   timestamp) is stored, for 90 days."
4. **Who can access it**: "No human; automated classifier plus audit log."
5. **A video or screenshots** of the feature working, on a test server.

## Annual renewal

- Put the renewal date in `memory/machine/project.json` → add a `renewals` field
  at P8; until then it lives here.
- Start 45 days early. A lapsed review does not instantly kill the bot, but it
  stops growth and can end access.
- Re-check this table each year: Discord changes thresholds and decouples review
  from verification.

## If denied

Ship the fallback, publicly. A bot that works without the intent is better than
one that argues with the platform — and the fallback is usually a better UX
anyway.
