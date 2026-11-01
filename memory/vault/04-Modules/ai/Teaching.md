# AI — teaching notes

## The one sentence

**Cost is a first-class constraint, and AI may recommend but never punish.**

Read the P4 code in this order:

1. `packages/kernel/src/ai.ts` — what a provider and a store are allowed to
   expose. Notice there is no prompt/completion field.
2. `modules/ai/src/provider.ts` — the offline deterministic provider used by
   tests, and the OpenAI-compatible adapter. No module imports either directly.
3. `modules/ai/src/service.ts` — policy, budget, retrieval, and the exact place
   where a completion becomes usage counters.
4. `modules/ai/src/commands/ai.ts` — the admin/user surface. It validates
   permissions and renders; it does not enforce the cap itself.
5. `apps/bot/src/ai-events.ts` — mention-only chat. The event is intentionally
   silent when the module is off or capped.

## Why the cap is server-side

Putting “do not spend more than $1” in a system prompt is not a budget. A prompt
can be ignored, injected into, or simply wrong. `AiService.assertBudget` reads
`ai_usage` for the guild and UTC month **before** it calls the provider. The
prompt has no access to that decision.

The cap is a pair: dollars and requests. Dollars catch an expensive model;
requests catch a provider that reports zero cost. Both are hard refusals.

```ts
// modules/ai/src/service.ts (shape)
const usage = await this.usage(guildId);
if (usage.requests >= policy.monthlyRequests) throw new UserError(...);
if (usage.costUsd >= policy.monthlyBudgetUsd) throw new UserError(...);
const answer = await this.provider.complete(...);
await this.store.addUsage({ requests: 1, costUsd: answer.costUsd, ... });
```

A call can cross the line by its own cost; the next call is refused. That is why
the status panel shows spend as well as the limit. If you need a strict
reservation (refuse before a call that *would* cross), add a reservation method
to `AiStore` and make the Postgres increment conditional. Do not move the check
into the command.

## Why RAG is not “send the whole server”

The model only sees:

- the current question;
- the top `contextChunks` chunks from **admin-added** documents; or
- the case facts/transcript the caller explicitly requested.

`ai_documents` stores explicit docs, not member messages. `ai_usage` stores
numbers only. If a future feature needs retention, it needs a schema change and
an ADR — not a new setting that quietly turns it on.

The reference index uses exact cosine over JSONB vectors so it works in PGlite
and in a self-host without an extension. See [[PGVector-Fleet]] for the open
pgvector ANN gate; do not describe the reference index as pgvector.

## Why explanations cannot punish

`explain` receives case facts from `ModerationPort` and returns text. It has no
`ban`, `timeout`, `deleteMessage` or role action. A moderator still decides.
This is the P4 version of the P2 rule: alert-only is the default; AI is another
alert/recommendation source, never an autonomous actor.

`classify` is the same idea with a narrower output: a label, confidence and
evidence words for a human. It has no path to a scanner action or a case state
change. If you want an AI flag to create a case, that is a separate P5 design
with review, appeal and a human gate — not a line added to `classify`.

## Exercise

1. Set a guild's budget to `$0.01` and a fake provider's cost per call to `$0.01`.
2. Ask twice. The first call should cost `$0.01`; the second should refuse and
   the provider's call count should stay at one.
3. Now set `enabled: false` and run `/ai status`. It must still respond, and
   `/ping` must still work. The kill switch removes capability, not commands.

## Mistake you will make

You will be tempted to put the system prompt, the user prompt and the completion
in a `conversations` table “for debugging”. That is the default-retention bug the
plan forbids. Debug with counters and a local fake; if you truly need a sample,
make it an explicit, redacted, expiring operator opt-in with its own ADR.

## What lost

- **Direct provider calls from the command.** Rejected: every path would need its
  own cap, key handling and retention decision.
- **Per-user caps.** Rejected as the primary control: a raid can spend a guild's
  budget across many users. The guild is the billing boundary.
- **Autonomous AI moderation.** Rejected: unappealable and outside the P2
  accountability model.
- **Prompt/completion retention by default.** Rejected: a data breach and a
  privacy promise are more expensive than a debugging convenience.
