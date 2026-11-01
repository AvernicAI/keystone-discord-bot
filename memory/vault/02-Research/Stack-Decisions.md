# Stack decisions

Evidence, not preference. The ADRs record what we chose; this page records what
we read before choosing.

## discord.js v14, not v15

The official guide says v15 "is in a pre-release state… we do not recommend you
update your production instance without careful and thorough testing". The 15.0.0
milestone was 94% complete with no due date as of late October 2026.

v15 also renames `ready` → `clientReady`, removes `Formatters`, moves sharding to
`@discordjs/ws`, and drops `Guild#shard`. That is a large diff to absorb before
it is stable.

**Decision:** v14 behind `apps/bot/src/adapt.ts`. The adapter is the only file
that imports discord.js interaction types, so the v15 bump is a contained PR.

## Not Oceanic, not Sapphire

- **Oceanic** is credible and modern, but its README makes no performance claim;
  the "faster than discord.js" line is folklore. Its ecosystem is much smaller,
  which shifts burden onto contributors.
- **Sapphire** already implements stores, pieces and preconditions — genuinely
  tempting. We rejected the dependency because its release cadence could not be
  verified, its types would leak into every module, and its docs compete in search
  with an unrelated bot of the same name. We copied the *pattern* instead.

**Decision:** own ~300 lines of registry and guards. The upgrade path stays ours.

## Postgres + Drizzle, not Prisma

Prisma's own comparison concedes that migrations work similarly in both. Drizzle's
advantage here is concrete: no codegen step in the contributor loop (Prisma needs
`prisma generate` before typecheck), queries stay close to SQL, and pgvector has
first-class support for the P4 RAG work.

**Caveat:** Drizzle does not create the `vector` extension; that is a hand-written
custom migration. Noted for P4.

## BullMQ, and why idempotency is a rule

BullMQ supports cron repeatables, retries with backoff, debouncing, parent/child
flows, stalled-job recovery, Prometheus metrics and OpenTelemetry. It also states
plainly that delivery is **at-least-once**.

**Decision:** every job that sends a message or moves a currency carries an
idempotency key. This is a code-review checklist item, not a hope.

## Lavalink for music, self-hosted only

Lavalink v4 is out of beta, needs Java 17+, and is explicitly designed as a
separate service with REST, auth, metrics and a stats endpoint. It is what the
surviving bots run.

**Legal reality:** YouTube's API policies forbid downloading/isolating audio, and
the bot ecosystem's streamers were never authorised by Google. Groovy and Rythm
were killed by C&D. Spotify's API does not permit streaming audio to a voice
channel either.

**Decision:** no bundled source plugin, music off by default, operator supplies
their own node. Documented as a risk in [[Non-Negotiables]].

## Starlight for docs

Astro Starlight ships Pagefind search, dark mode and i18n with almost no JS.
Docusaurus has better versioning and a bigger plugin ecosystem, which we do not
need for a contributor guide. The docs live in `apps/docs` at P7; the vault stays
the design record.

## Deferred, deliberately

| Thing | Why not now | When |
| --- | --- | --- |
| Turborepo | No build graph to cache at this size; adds config tax | P1 |
| tsup/rollup build | Source exports keep the loop fast; production image needs a build | P1 |
| Sharding | 2,500-guild threshold is far away; adapter keeps the door open | P8 |
| Redis | In-memory cooldowns are honest for P0 and documented as such | P1 |
| OpenTelemetry | One process, readable JSON logs | P1 |

## Sources

- `discordjs.guide/v15`, `github.com/discordjs/discord.js/milestone/141`
- `github.com/OceanicJS/Oceanic`, `github.com/sapphiredev/framework`
- `orm.drizzle.team/docs/guides/vector-similarity-search`
- `docs.bullmq.io`, `lavalink.dev/plugins.html`
- `developers.google.com/youtube/terms/developer-policies`
- `theverge.com/2021/9/12/22669502` (Rythm/Groovy shutdown)
