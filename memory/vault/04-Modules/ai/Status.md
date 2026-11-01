# AI — status

## Now

P4 is complete in-repo as of passes 08–09 (2026-11-01). The AI module ships the
provider abstraction, exact-vector server RAG, ticket deflection, mention-only
persona chat, moderation explanations, thread summaries, hard per-guild caps and
the off-by-default kill switch. The same phase hardened the community economy;
AI behavior is unchanged. `/ai` is the only new root; the ledger is 10/100 and
all five modules are registered.

The provider is not configured in this environment, live Discord mention events
are not observed, and the pgvector extension benchmark is partial. Those are
listed below, not claimed as verified.

## Verified

```text
pnpm typecheck                         exit 0
pnpm test                             129 tests / 23 files
  modules/ai/src/ai.test.ts           7 tests
  modules/ai/src/provider.test.ts     3 tests
  modules/ai/src/commands.test.ts     7 tests
  modules/community/src/commands.test.ts 9 tests (incl. /ticket summary)
  packages/db/src/ai.test.ts          2 tests
pnpm budget                           10/100, status OK
pnpm memory:check                     72/72
pnpm build from removed dist          exit 0 (sizes in journal pass 09)
```

P4 feature proofs:

| Feature | Test assertion |
| --- | --- |
| Provider abstraction | Unconfigured provider refuses; fake-fetch OpenAI-compatible provider calls `/chat/completions` and `/embeddings`, sends auth, computes rate-card cost; HTTP 429 surfaces |
| Hard dollar cap | First $0.01 call succeeds at a $0.01 cap; the next call is refused and the counting provider is not called again |
| Hard request cap | One request succeeds at `monthlyRequests: 1`; the next is refused before the provider |
| RAG | Admin doc chunks; `ask` retrieves the doc and exposes its source name; no prompt appears in usage/output keys |
| Zero retention | `ai_usage` has only `guildId`, `period`, `requests`, `inputTokens`, `outputTokens`, `costUsd`; migration has no prompt/completion columns |
| Deflection | No doc → `retrieval-only` human hand-off, zero model calls; doc → grounded answer with source |
| Mention-only chat | Service chat works; `chat: false` refuses with a feature-specific error; event ignores bots/DMs/non-mentions by construction |
| Advisory classification | Service returns an advisory label/evidence with no action; `/ai classify` is guarded by `ManageMessages` and uses the same cap path |
| Mod explanations | `/ai explain` reads an existing case, returns a titled explanation and leaves the case state `open` |
| Thread summaries | `/ticket summary` calls the same `AiPort` and renders a summary with “A human decides any action” |
| Kill switch | `/ai status` works while disabled and reports `Retention: none`; disabling does not unregister commands |
| Isolation | Documents are guild-scoped; removing another guild's id is `false`; PGlite persists docs and usage counters |
| Postgres | Migration 0005 and `DrizzleAiStore` persist chunks and aggregate usage atomically on PGlite |

## P4 exit

**Green in-repo for the named P4 features.** Every provider call is preceded by
the hard budget check; prompts/completions are not stored by default; the module
can be disabled without breaking a command. The command budget is **10/100**, no
feature is paid, and no new privileged intent is required.

Not green and not claimed:

- pgvector ANN at 1M×1536 and its p95 recall/latency: the local exact-cosine
  harness ran 1M synthetic 32-dimensional vectors (p95 136.96 ms, recall 1.0).
  See [[PGVector-Fleet]]. The extension path is open.
- Real provider calls, real Discord mention events and live ticket threads.
- The operator must set `AI_API_KEY` and `AI_BASE_URL`; no key is shipped.

## Proven vs still needs a live service

| Claim | Proven here? | How to close |
| --- | --- | --- |
| Provider request shape/auth/cost | Yes, fake fetch | Run against a real allowed provider |
| OpenAI-compatible embedding response | Yes, fake fetch | Same |
| Cap refusal before provider | Yes, counting provider | Same against the configured provider |
| Docs and usage persistence | Yes, PGlite | Same against a Postgres server |
| Exact vector retrieval | Yes, deterministic embeddings | Measure with production embeddings and pgvector ANN |
| Mention-only event | Service only | Staging guild with `MessageContent` |
| Ticket summary seam | Command test + recorder | Live ticket thread |
| Live Discord message sends | No | Token and staging guild |
| 1M×1536 pgvector p95/recall | No | Benchmark a Postgres+pgvector instance with production dimensions |

No document claims a live provider or Discord run for a row marked open.

## Known limitations

- The reference index is exact and in-application, not pgvector ANN; it is fine
  for small server docs and is the portable test/PGlite path.
- The provider is OpenAI-compatible only; no vendor SDK or automatic fallback.
- Cost is provider-reported/rate-card based; a provider that reports zero cost
  defeats the dollar cap, though the request cap still applies. Operators should
  set both.
- The monthly period is UTC; a guild cannot reset it early.
- `temperature` is reserved and not sent by the minimal provider adapter.
- Mention chat replies once per mention; no conversation memory is retained.
- `/ai summary` and `/ticket summary` require `ManageGuild`; there is no public
  summary button yet.
- Automatic summaries on ticket close are not wired. The P4 plan does not name
  them; [[ADR-0011-economy-ledger-and-double-spend]] records the decision so the
  omission is deliberate rather than ambiguous.

## Next

- P5 dashboard/fleet: per-guild authorisation, importers, export/restore.
- Close the pgvector ANN benchmark with a Postgres+pgvector instance.
- Add a real-provider smoke test only when an operator key and network policy
  allow it; never in `pnpm check`.
