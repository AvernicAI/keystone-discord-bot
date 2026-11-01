# ADR-0010 — AI provider abstraction with server-side guild caps

## Status

Accepted — P4, 2026-11-01.

## Context

P4 needs server-doc RAG, ticket deflection, a mention-only persona, moderation
explanations and thread summaries. These features share three dangerous
properties: they can spend money, they can leak message content, and they can be
mistaken for authority. The repo must remain free to self-host and testable
without a token, a network or a provider key.

## Decision

1. `AiProvider` is a kernel-level structural contract with `complete` and
   `embed`. The composition root chooses an OpenAI-compatible adapter or an
   explicitly unconfigured implementation. No module imports a vendor SDK.
2. `AiService` owns policy and cap enforcement. It reads the guild's monthly
   `ai_usage` counters before every provider call; the cap is not in a prompt and
   not in a command.
3. `ai_usage` stores aggregate counters only (`requests`, tokens, micro-dollars).
   `ai_documents` stores explicit admin docs and their vectors. There is no
   prompt or completion column and no setting that creates one.
4. RAG uses a portable exact-cosine index over chunk vectors. PGlite has no
   pgvector extension; the pgvector ANN gate is recorded separately as open.
5. AI output is advisory. There is no moderation action path from the AI module.
6. The module is off by default with a master `enabled` switch plus per-feature
   switches. Status remains available when disabled.
7. `/ai` is one new root (`10/100`); `/ticket summary` reuses the existing ticket
   transcript and the `AiPort`. No new privileged intent is added.

## Alternatives

| Option | Why it lost |
| --- | --- |
| Call the provider directly from each command/event | Cap, key, retention and error policy would be duplicated and eventually diverge. |
| Per-user cap instead of per-guild | A raid can spend the guild's budget across many users; the guild pays the bill. |
| Put the budget instruction in the prompt | A prompt is not an enforcement boundary and can be injected. |
| Store prompts/completions “for debugging” | Directly violates the zero-retention exit condition; a breach cost is permanent. |
| Autonomous AI moderation | Unappealable, outside the P2 case/review model, and explicitly a non-goal. |
| Require pgvector for all deployments | PGlite, local dev and the token-free test suite cannot run the extension; the reference index is portable. |
| Ship a bundled local model | Adds multi-gigabyte downloads, GPU assumptions and unclear licences; the operator chooses a provider. |
| No AI at all | Fails the P4 parity rows and the named MEE6/Ticket Tool replacement goal. |
| Per-server lifetime AI licence | Violates the free-core promise and the non-goals. |

## Consequences

- The provider can change without touching a module; the module can be tested
  with a deterministic offline provider.
- A guild can be capped without a prompt change; usage is auditable by month.
- The reference index is exact and honest, but not a pgvector ANN benchmark. The
  extension comparison remains an external research gate.
- Operators must set `AI_API_KEY`/`AI_BASE_URL`; without them status says
  `unconfigured` and answer calls refuse safely.
- A provider that reports zero cost still meets the request cap but not the dollar
  cap; both caps are required in the status and docs.
