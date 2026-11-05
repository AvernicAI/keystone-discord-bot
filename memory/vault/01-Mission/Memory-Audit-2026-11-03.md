# Memory audit — 2026-11-03

> **Scope:** the `/memory` half of the repository: `memory/machine/`,
> `memory/vault/`, `memory/journal/`, the generated pages and the gates that
> check them. **Method:** read `AGENTS.md`, the machine files, the newest journal,
> every mission page, the parity matrix, the architecture page and the memory
> tooling; run the gates; compare prose with the code-linked machine files; then
> repair only the drift that could be proven.
>
> **Verdict:** the memory is substantially honest. The counts, feature evidence
> and pass ledger agree with the code. The defects are editorial and semantic:
> a Windows line-ending trap in the gate, several stale current-tense sentences,
> one missing ADR pointer, and a status vocabulary that conflates "not live" with
> "not built". None of those invalidates the product claims; all of them make the
> memory harder to trust than it should be.

## 1. Gate results

| Gate | At audit start | After | Evidence |
| --- | --- | --- | --- |
| `pnpm audit:claims` | 37/37 | 37/37 | 20 roots · 141 subcommands · 161 actions · 4 menus · 12 modules · 631 tests |
| `pnpm memory:check` | 3,712/3,715 | 3,715/3,715 after render; 3,746/3,746 after this pass's pages and pass entry | Three generated pages were stale; `pnpm memory:render` rewrote them |
| Vitest report | 631 tests / 92 files | unchanged | `memory/machine/test-report.json` |
| Live probe | 28/28 | unchanged | `memory/machine/live.json`, 2026-11-03 |
| Journals | 65 at audit start; 66 with this entry | +1 | one entry per pass |

### The three failures were line endings, not content

The failing pages were `01-Mission/Feature-Status.md`,
`05-Learning/Pass-Ledger.md` and `06-Operations/Live-Window.md`. `pnpm
memory:render` rewrote all five generated pages; `git diff --stat` was empty
because Git normalises the line endings on the way back. At audit time the repository had no
`.gitattributes` and `core.autocrlf=true` on this Windows machine, so the working
tree can hold CRLF while the renderer writes LF. `memory:check` compares bytes.

**Consequence:** a fresh Windows checkout can fail the memory gate with pages
that are semantically current. That is a gate bug, not a documentation bug.

**Fix (P0, done in pass 66):** add `.gitattributes` with `* text=auto eol=lf`, renormalise once,
and make the generated-page check compare normalised line endings so a Windows
checkout cannot fail for whitespace. A Linux CI job is not a substitute; the
gate must pass where contributors work.

## 2. Machine truth snapshot

| Fact | Value | Source |
| --- | --- | --- |
| Modules | 12 | `project.json` |
| Global roots | 20 | `commands.json` |
| Subcommands | 141 | `commands.json` |
| Total actions | 161 | `commands.json` |
| Context menus | 4 (2 user, 2 message) | `commands.json` |
| Tests | 631 in 92 files | `test-report.json` |
| Passes | 65 at audit start; 66 with this entry | `passes.json` |
| Decisions | 19 | `decisions.json` |
| Feature rows | 134 | `features.json` |
| Shipped in repo | 114 | `features.json` |
| Open | 10 | `features.json` |
| Planned | 6 | `features.json` |
| Non-goal | 4 | `features.json` |
| Live-verified rows | 48 | `features.json` |
| Live probe checks | 28 | `live.json` |

**Read those numbers carefully.** "Shipped in repo" means code, tests and evidence
exist. It does not mean a human has observed the behaviour on Discord.
"Live-verified" means a named live check exists — but only 23 of the 48 rows
carry a `liveEvidence` array, so the flag currently conflates a SQL/service probe
with a gateway observation. The audit treats that as a semantic defect (A-11)
rather than a lie.

## 3. What is trustworthy

- **Counts:** high confidence. `audit:claims` recomputes roots, subcommands,
  actions, menus, modules and tests from the registry and the test report, and
  `memory:check` cross-checks `commands.json`, `project.json` and the report.
- **Feature existence:** high confidence. Every `shipped-in-repo` row has at
  least one evidence path, and `memory:check` verifies module layout and command
  coverage.
- **Live proof:** medium confidence. `live.json` is a real 28-check run against
  Postgres, Redis, the queue and the web process, but several rows marked live
  have no named check and the probe uses fake OAuth exchanges.
- **Competitor data:** medium confidence. Pricing pages are often JS-rendered;
  the internal teardowns label their confidence and expiry, and `research.json`
  keeps source, retrieval date and expiry. Treat every price as a claim to
  re-verify before launch.
- **Prose:** medium confidence. The drift register below is the honest list.

## 4. Drift register

Severity: **P0** breaks a gate or a public claim now; **P1** undermines a current
decision; **P2** is a memory-design improvement. The register records what was
found before remediation; the P0 rows were fixed in pass 66 and the fix is named
in the last column where it landed.

| ID | Sev | File | Claim found | Truth | Fix |
| --- | --- | --- | --- | --- | --- |
| A-01 | P0 | gate | Generated pages compare raw bytes | CRLF on Windows makes current pages "stale" | `.gitattributes` + normalised comparison (pass 66) |
| A-02 | P0 | `README.md:66` | "all 17 migrations are applied … `pnpm probe:live` is 19/19" | 20 migrations; probe is 28/28 | Update the sentence; link `live.json` (fixed pass 66) |
| A-03 | P0 | `project.json` | At audit time, 18 decisions | `decisions.json` has 19; ADR-0019 exists | Added ADR-0019 in pass 66 |
| A-04 | P0 | `AGENTS.md` | "redesigning moderation's `appeal`/`verify` ids … is open" | Pass 64 shipped it; the same file says so later | Deleted in pass 66 |
| A-05 | P1 | `Master-Plan.md:289` | "A Components V2 budgeter (planned; no `packages/ui` yet)" | `packages/ui` exists since pass 58 | Mark the historical line or update it |
| A-06 | P1 | `Parity-Matrix.md:68` | Rank card "the V2 layer exists (pass 58), the card is not migrated yet" | Pass 60 migrated the card | Update the row |
| A-07 | P1 | `Parity-Matrix.md:214` | "temp-ban/role expiry and case export open" | Temp expiry shipped pass 45; case export is open | Split the sentence |
| A-08 | P1 | `Parity-Matrix.md:216` | "panic mode open" | Panic mode shipped pass 46 | Update the tally |
| A-09 | P1 | `Parity-Matrix.md:219` | "goodbye messages open" | Goodbye shipped pass 46 | Update the tally |
| A-10 | P1 | `Command-Budget.md:99` | "Seventeen roots today" | Twenty roots | Update; the table already shows twenty |
| A-11 | P1 | `Home.md` open questions | "The licence … blocks external contributions" | Q-1 is answered: AGPL-3.0-or-later | Remove the stale blocker |
| A-12 | P1 | `Roadmap.md` P7 | "The rest of this phase is open" followed by shipped items | Goodbye, V2, i18n and signed ids shipped | Rewrite the remaining-open list |
| A-13 | P1 | `features.json` | `events.reminders` and `events.ics-export` are `open` **and** `liveVerified: true` | The live check proves manual reminders / JSON export, not the open half | Split the row or add a `liveScope` |
| A-14 | P1 | `features.json` | 25 rows have `liveVerified: true` and no `liveEvidence` | The flag cannot be audited | Require a check id per live row |
| A-15 | P1 | `features.json` | `operations.web-dashboard` is `open` | Auth, sessions, forms, writes, templates, portability and analytics are shipped; only live Discord OAuth is open | Use a partial status or name the single blocker |
| A-16 | P1 | `project.json` module status | `p2-core`, `p4-economy`, `p4-complete`, `beta`, `stable` | Mixes phase names with maturity | Separate `phase` from `maturity` |
| A-17 | P2 | `Status.md` | Pass 65, then 64, 62, 61, 64, 60 … with pass 64 repeated | Accurate history, unreadable order | Keep the five newest passes in `Now`; move the rest to the generated ledger |
| A-18 | P2 | `README.md` / `AGENTS.md` | Long duplicated current-state ledgers | They drift independently | Generate one summary block or link the generated truth |
| A-19 | P2 | `research.json` | Pricing claims with `expiresAt` 2027-01-31 | Some prices are medium confidence and JS-blocked | Re-verify before P10 launch marketing |
| A-20 | P2 | checks | No check that `open` + `liveVerified` is intentional | A contradiction can ship | Add a schema/check rule |
| A-21 | P2 | checks | No check that module status matches the feature rows | A module can say `beta` while its rows are `open` | Add a consistency check |
| A-22 | P2 | `features.json` | `source` sometimes points at a research page, not the spec/status page | Traceability is weaker than it looks | Require a module spec/status source |

## 5. The semantic defects, in plain language

### 5.1 `open` is doing three jobs

The feature vocabulary has one word for three different states:

1. **Absent:** `moderation.case-export` has no command.
2. **Partial:** `operations.web-dashboard` ships most of the capability but not
   the live Discord OAuth round trip.
3. **Manual half:** `events.reminders` ships `/event remind` but not scheduled
   delivery.

A reader cannot tell whether "open" means "write it" or "prove it". The plan in
[[Roadmap-v3]] treats partial rows as a first-class state.

**Recommendation:** add `status: partial` with `shippedParts` and `openParts`, or
keep `open` and require both arrays. Do not change the schema until the
`memory:check` rules are updated in the same pass.

### 5.2 `liveVerified` is doing two jobs

A live probe against Postgres is not a gateway click. The flag should say which
one it means. The audit recommends:

- `probeVerified`: a named check in `live.json` passed.
- `gatewayVerified`: a human observed the gateway path.
- `liveEvidence`: the check id(s) that justify either flag.

Until then, a row marked `liveVerified: true` without `liveEvidence` is a
promise, not evidence. The plan's truth phase requires the array.

### 5.3 Module status is a phase label

`moderation` is marked `p2-core` although it ships P7 features; `community` is
marked `p4-economy` although it ships panels, giveaways, tickets and feeds. The
`phase` field already records the origin. `status` should record maturity:
`reference`, `beta`, `stable`, `deprecated`. A phase is history; a status is
today.

## 6. Remediation plan

### P0 — before the next pass

1. Add `.gitattributes` (`* text=auto eol=lf`) and renormalise the tree.
2. Make `memory:check` normalise CRLF before comparing generated pages.
3. Fix `README.md` migration/probe counts and link the live report.
4. Add ADR-0019 to `project.json`.
5. Remove the stale appeal/verify clause from `AGENTS.md`.

### P1 — P7.5 truth pass

6. Correct the parity tally and the rank-card row.
7. Correct the Master-Plan V2 sentence.
8. Correct the Command-Budget root sentence.
9. Correct the Home licence blocker.
10. Rewrite the Roadmap P7 "remaining open" list.
11. Decide the `partial` status and `liveScope` schema; update the checks with it.

### P2 — memory v3

12. Require `liveEvidence` for every live row; add a check.
13. Add a check that `open` + `liveVerified` is either intentional or an error.
14. Add a module-status vs feature-status consistency check.
15. Generate the README/AGENTS current-state block from machine truth.
16. Move the long Status history into the generated pass ledger.
17. Add a research freshness check: warn when a claim used in a governed page is
    past `expiresAt`.

## 7. What this audit does not claim

- It does not claim the 114 shipped rows are live-verified.
- It does not claim competitor prices are current; they are dated claims.
- It does not claim the generated pages were wrong in content; the initial
  failure was line endings.
- It does not claim the machine files are complete. The missing live evidence is
  the largest honesty gap, and the plan schedules it.

## 8. Bottom line

The memory system is doing the hard thing: it ties prose to code and fails when
they disagree. The remaining work is not "write more docs". It is to make the
vocabulary precise, make the gate platform-stable, and stop duplicating the same
ledger in five places. Fix those and the memory becomes an asset a stranger can
trust on first read — which is the actual standard in [[Mission]].
