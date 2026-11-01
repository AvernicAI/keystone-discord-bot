# AI — spec

P4 adds an **opt-in, capped AI layer** on top of the P1 data spine and the P3
ticket content. It replaces the paid AI add-ons of **MEE6** and **Ticket Tool**
for the jobs an admin actually uses: answering from server documentation,
suggesting a reply before a ticket is escalated, explaining a moderation case,
summarising a ticket, and a mention-only persona chat.

Everything is free. AI is **off by default**, and every provider call is checked
against a per-guild monthly dollar and request cap on the server. It may explain
and recommend; it may never punish, delete, ban, or claim an action happened.

## Commands

| Command | Options | Guards | Behaviour |
| --- | --- | --- | --- |
| `/ai` | `action` (status, ask, chat, classify, docs-add, docs-list, docs-remove, deflect, explain, summary, budget), `question`, `value`, `name`, `case`, `ticket`, `limit` | guild-only; `ManageGuild` for docs, budget, explain and summary; `ManageMessages` for deflect/classify | Status and usage, server-doc Q&A, explicit chat, advisory classification, document indexing/removal, ticket deflection, case explanations, thread summaries and hard budget configuration. |
| `/ticket summary` | existing ticket options | guild-only; `ManageGuild` | Uses the transcript already stored by the P3 ticket lifecycle and the same `AiPort`; no second transcript store is created. |

`/ai` is the only new root in P4. The ledger goes from 9 to **10 of Discord's 100**
global commands. No new privileged intent is introduced: `GuildMessages` and
`MessageContent` are already required by the community/moderation pipeline.

## Features and where they live

| Feature | Behaviour | Implementation |
| --- | --- | --- |
| Provider abstraction | `AiProvider` has `complete` and `embed`; the composition root selects OpenAI-compatible or explicitly unconfigured | `modules/ai/src/provider.ts`, `packages/kernel/src/ai.ts` |
| Hard per-guild cap | Dollar and request counters are checked before every completion/embedding; usage is monthly UTC | `AiService.assertBudget`, `ai_usage` |
| Server RAG | Admin docs are chunked, embedded and retrieved by exact cosine; answers cite source names | `AiService.addDocument`, `retrieve` |
| Ticket deflection | Retrieves docs and returns a suggested reply; no matching doc returns a human hand-off and does not call a model | `AiService.deflect` |
| Mention-only persona chat | A message that mentions the bot is answered; no other message is read for chat; explicit `/ai chat` is also available | `apps/bot/src/ai-events.ts`, `AiService.chat` |
| Advisory classification | Labels a supplied message with confidence and evidence; no action path and no automatic punishment | `/ai classify`, `AiService.classify` |
| Moderation explanations | Takes the existing case facts and explains why a rule may have fired; leaves the case unchanged | `/ai explain`, `AiService.explain` |
| Thread summaries | Summarises the existing ticket transcript on demand; never invents a resolution | `/ticket summary`, `/ai summary`, `AiService.summarize` |
| Kill switch | `enabled: false` is the default; disabling it does not unregister `/ai` or break `/ticket`/`/ping` | `aiSettingsSchema`, `AiService.status` |
| Zero retention | Prompt and completion text have no column and no store field; only aggregate counters and explicitly added docs are stored | `ai_usage`, `ai_documents`, ADR-0010 |

## Data

- `ai_documents` (migration 0005) — guild-scoped admin documentation, chunk text
  and portable embedding vectors. This is explicit admin content, not member
  messages.
- `ai_usage` — `(guild_id, period)` counters: requests, input/output tokens and
  integer micro-dollars. It deliberately has no prompt, completion, user id or
  channel id.
- `Member messages and ticket transcripts are read transiently for a requested
  answer or summary. They are not persisted by the AI module. P3's ticket
  transcript remains the only default message-content store and is documented in
  the community spec.
- The reference retrieval index is exact cosine over JSONB vectors. PGlite has no
  pgvector extension; the pgvector-at-fleet-scale research gate is separately
  recorded as open/partial in [[PGVector-Fleet]]. The module contract does not
  depend on the extension.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master kill switch; off means every answer call refuses safely |
| `chat` | `false` | Mention-only persona chat |
| `classification` | `false` | Advisory message classification |
| `deflection` | `false` | Ticket-deflection suggestions |
| `explanations` | `false` | Moderation-case explanations |
| `summaries` | `false` | Ticket/thread summaries |
| `monthlyBudgetUsd` | `1` | Hard monthly dollar ceiling, checked server-side |
| `monthlyRequests` | `250` | Hard monthly request ceiling |
| `maxOutputTokens` | `300` | Per-call output ceiling |
| `contextChunks` | `3` | Retrieved chunks supplied as context |
| `maxDocumentChars` | `6000` | Admin document size cap |
| `chunkChars` | `1200` | Retrieval chunk size |
| `temperature` | `0.2` | Reserved for providers that accept it |
| `retention` | `"none"` | Literal; there is no setting that enables prompt retention |

Provider credentials are **operator environment variables**, never guild
settings, prompts, logs, or Discord messages: `AI_API_KEY`, `AI_BASE_URL`,
`AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_INPUT_USD_PER_MILLION`,
`AI_OUTPUT_USD_PER_MILLION`.

## Safety and limits

- The cap check runs before the provider call and is independent of the prompt.
  A guild at its cap gets a refusal even if a prompt asks to ignore the cap.
- The provider receives only the current question plus retrieved admin docs (or
  the case facts/transcript the caller explicitly requested). No prompt or
  completion is written back.
- AI output is advisory. The module calls no moderation action, role mutation or
  currency movement. Explanations leave the case state untouched.
- Deflection with no retrieved doc returns a human hand-off without spending a
  completion.
- Mention chat ignores bots, DMs and messages without a usable mention. A
  disabled/capped guild receives no chat reply.
- Local E2E only: outside production, `DEV_GUILD_ID` allows bot authors to
  trigger chat in that one guild so an MCP harness can exercise the real event.
  Production passes nothing; the normal bot gate remains the default.
- Qwen3 on Ollama needs `AI_DISABLE_THINKING=true` so the hidden reasoning stream
  does not consume the entire output budget. The adapter sends Ollama's
  `think:false` only when this option is on, because other providers reject it.
- No AI test uses a token, a live guild or the network. The provider tests use a
  fake fetch; the service tests use a deterministic offline provider.
- The operator can unconfigure the provider at any time; `/ai status` becomes
  `unconfigured` and all answer calls refuse rather than silently substituting a
  local model.

## Open / non-goals

- Live Discord mention events and a real local provider were observed on
  2026-11-01 with qwen3:8b via Ollama. A hosted provider and a human author are
  still unverified.
- Application-command execution is not exposed by SaseQ/discord-mcp; invoking
  `/ping` or `/setup` still requires a human Discord client. The development `!`
  bridge exercises the same dispatch pipeline, but it is not the slash path.
- pgvector ANN at 1M×1536 with p95 recall/latency is not proven. The local exact
  index was measured at 1M×32 (p95 136.96 ms, recall 1.0) as a reference only.
- Autonomous AI moderation, AI punishment, prompt/completion retention, and AI
  training on server messages are non-goals.
- Translation is a non-goal (see the parity matrix).
