# Open-source prior art

What to copy, what to avoid — with the reason, because the reason is the lesson.

## Copy

### Red-DiscordBot — the extension model
Python, GPL-3.0. Cogs are hot-loaded, and third-party cogs can be installed from
inside Discord. Contributions are gated by tests, docs built with warnings as
errors, and a rule that new cogs need an approved issue.

**Copy:** the interface-not-a-switch approach, the scope gate ("no new module
without an approved spec"), and tests as a merge requirement.
**Skip:** hot-loading from arbitrary URLs — a security surface we do not need.

### TSCord — guards and migrations
TypeScript, MIT. Auto-discovered handlers, dependency injection, *guards* as
middleware (rate limiter, maintenance mode, guild-only, NSFW-only), Mikro-ORM
migrations, typed i18n, CLI scaffolding.

**Copy:** guards (ours live in the kernel and run before every command) and
migrations as a first-class subsystem.
**Skip:** the DI container. It reads as ceremony to a learner, and our registry
already provides the one seam that matters.

### KevinNovak's template — sharding honesty
TypeScript, MIT. Minimal, ESM, sharding + clustering, PM2/Docker, multi-language.

**Copy:** the "sharding is documented, not discovered" posture, and the refusal to
hide infrastructure behind magic.
**Skip:** JSON config files for anything per-guild.

### YAGPDB — process split
Go, modular plugins split across bot / web / feed binaries, each with its own
migrations.

**Copy:** separate the gateway process from slow work. Ours is `apps/bot` +
`apps/worker`; the same idea at a smaller scale.

### ActivityRank — small monorepo reference
TypeScript, AGPL-3.0. pnpm workspaces, bot + manager service, JSON-Schema-validated
config per app.

**Copy:** validate config with a schema so the editor flags errors before boot.

## Avoid

### Skyra — "do not self-host this"
Excellent i18n and typed command design, but the README tells you not to run your
own instance and requires Postgres + InfluxDB + many API keys. Extensibility
without runnability is not extensibility.

**Lesson:** a contributor must be able to reproduce the whole system locally.

### NadekoBot — the CLA
AGPLv3 plus a contribution agreement assigning irrevocable IP rights to the owner
for relicensing. Documented contributor deterrent.

**Lesson:** do not require copyright assignment. See [[Governance]].

### Loritta — the economics
Went closed-source in May 2026 because open source produced complaints and code
theft rather than contributors.

**Lesson:** the contributor ramp (guards, tests, i18n, one-command dev) must exist
*before* the 300th command, or the project becomes a solo burden with public
liability. This is why P0 exists and why the memory system is not optional.

### Auttaja — beautiful, dead
Distributed shard-manager / dispatcher / broker design in Go. Last commits 2019,
no public members.

**Lesson:** architecture without a bus factor is a museum piece.

### "500 commands" repos
Tutorial projects that count commands instead of solving problems. They dominate
GitHub topic pages and teach the wrong lesson.

**Lesson:** the command budget is a design tool, not a limitation to brag about
overcoming.

## The synthesis

Our shape — kernel + module contract + guards + migrations + fake interactions +
teaching docs — is Red's extension model, TSCord's middleware, YAGPDB's process
split and KevinNovak's infrastructure honesty, without the parts that made each of
them hard to fork.
