# User voice — what owners complain about (2025–26)

> Evidence quality matters more than volume. Reddit and Trustpilot page bodies
> were blocked during this pass; quotes below are search snippets unless marked
> otherwise. Claims live in [[Claims]].

## Priority list

| Priority | Pain | Evidence | Our answer |
| --- | --- | --- | --- |
| P0 | Retroactive paywalls and core features gated | Multiple vendor comparisons; Reddit snippets | Free core, no re-gating, written in [[Non-Negotiables]] |
| P0 | Bot sprawl: many dashboards, syntaxes, invoices | Comparator tables; Nightwatch's founding rationale | One bot, one dashboard, one schema |
| P1 | Per-server billing and refund friction | Official pricing pages plus anecdotes | Self-host free; no per-server feature locks |
| P1 | Dashboard and command parity; silent panel breakage | Live Carl-Bot GitHub issues | Schema-driven forms plus a parity test |
| P1 | Reaction/self-assign roles capped | Feature tables | Buttons and selects, no artificial cap |
| P2 | Context-blind automod false positives | Vendor claims and long-standing pattern | Evidence, review queue, dry-run, advisory AI |
| P2 | Tickets + analytics + leveling in one bot | Comparator tables | The union, not half-bots |
| P2 | Setup effort / overwhelming config | Comparator reviews | `/setup` capability report, templates, import |
| P3 | AI as a visible persona | Snippet-only | Invisible-first, opt-in persona |
| P3 | Uptime and support opacity | Snippet-only | Status page, runbooks, honest status |

## The complaints that change design

### "I can't change settings I already configured"

This is not a complaint about premium existing. It is a complaint about
**retroactive re-gating**. The answer is structural: the free core is the
product, and no feature moves behind a wall later. A hosted tier may sell
convenience, never a feature that was already free.

### "I need four bots to run one server"

The all-in-one label is marketing for two to four half-bots. MEE6 has leveling
but no reaction roles; Dyno has no leveling or reaction roles; Carl-bot has no
leveling or tickets. The union is the product. The command budget is how the
union stays navigable: hubs, not 500 roots.

### "The dashboard can't do what the bot can"

The top-engagement Carl-Bot issues are dashboard failures: reaction roles not
editable, 500s, emoji pickers offering unavailable emoji. Dashboard parity is not
polish; it is a test. Every module schema must render a form, and every write
must be authorized per guild, not hidden in the UI.

### "The filter caught a joke and muted a regular"

Keyword and regex filters cannot see context. Our answer is alert-only by
default, evidence cards, a review queue, an appeal button, and AI that labels but
never punishes. The AI is invisible infrastructure, not a chat persona.

## AI sentiment

Owners want AI as an **unseen backend**: better false-positive filtering, setup
automation, search over their own history. They distrust AI as a **visible
personality**, especially when a vendor trains on member messages. "AI" is closer
to a red flag than a selling point in owner communities.

Consequence: P7 ships triage labels, semantic search and summaries first; persona
chat stays opt-in, mention-only and zero-retention.

## Pricing and switching

The anchor is low because free alternatives exist. A $12 per-server subscription
is read as overpriced when the features are available free elsewhere. Per-server
billing is the trigger; "no refunds" turns it into a trust problem.

Keystone's answer is not a cheaper subscription. It is self-host free with no
feature metering, and a hosted convenience tier only if one ever exists.
