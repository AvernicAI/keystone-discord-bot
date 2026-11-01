# Migration guides

> The honest promise: **export everything, import where the source permits, guide
> the rest.** This page is the "guide the rest" half. The evidence is
> [[Import-Formats]]; the mechanics are [[Portability-Runbook]].

## Read this first

No surveyed generalist — Dyno, Carl-bot, Wick, MEE6 — documents a complete
config-and-history export. A destination bot that claims "one click from every
bot" is either scraping, asking for your credentials, or importing less than it
says. We do none of those.

So each migration has one of three shapes:

| Shape | Sources | What you get |
| --- | --- | --- |
| Full restore | Keystone bundle | settings, cases, tickets, levels, ledger, records, AI docs |
| File import | MEE6, Lurkr, Polaris, Arcane (user file), XP Bot, generic JSON/CSV, ProBot JSON, Ticket Tool HTML | levels, or transcript archives |
| Guided rebuild | Dyno, Carl-bot, Wick | a checklist and the exact Keystone settings to recreate |

## MEE6 → Keystone

**Transfers:** XP and level rewards.

1. Save your MEE6 leaderboard as JSON (the shape with `players[]`) from the
   export/tooling your server already uses. Do not paste a dashboard URL and ask
   Keystone to scrape it.
2. Run `pnpm portability levels <file> <guildId> --dry-run`.
3. Review skipped ids and duplicates; run again with `--mode keep-higher --yes`.
4. Recreate role rewards in `/rank rewards` (the ids are different in Keystone).
5. MEE6's welcome, logs, automod and economy have no portable export. Recreate
   them with `/setup` and the module specs; do not expect history.

**Lost:** message counts, MEE6 dashboard-only settings, its own audit trail.

## Lurkr / Polaris / XP Bot / Level Up → Keystone

**Transfers:** XP, level, message count is ignored (Keystone does not rank by
message count).

1. Export JSON from the source.
2. `pnpm portability levels <file> <guildId> --dry-run`.
3. Apply with `keep-higher` unless you are deliberately replacing the table.

**Lost:** source-specific multipliers and season archives unless the file carries
them; Keystone's curve is canonical.

## Arcane → Keystone

Use a **user-supplied JSON export**. Console scraping is refused: it is hostile
to the vendor, brittle, and outside our non-negotiables. If Arcane gives you only
a dashboard, use the guided rebuild below.

## ProBot → Keystone

**Transfers:** a normalized text archive of the ticket transcript.

```bash
pnpm portability transcript ./ticket.json <guildId>
```

**Lost:** live ticket channel, message ids, attachments/reactions, the ability to
reopen the original ticket. The archive is evidence, not a working ticket.

## Ticket Tool → Keystone

**Transfers:** the user-owned HTML transcript, stripped to readable text and
stored as a `ticket_transcript` community record.

**Lost:** ticket panel configuration, SLA history, live threads. Recreate the
panel with `/ticket panel`; open new tickets in Keystone.

## Dyno → Keystone

**Transfers:** nothing automatically. Dyno has no documented config/case export.

**Guided rebuild:**

- [ ] Roles and channel ids: create them, then paste the ids into the dashboard
      when P6 lands; today use the module settings through commands.
- [ ] Moderation: dry-run is on by default. Recreate log channel, quarantine role
      and rule thresholds; do not import case numbers from screenshots.
- [ ] Welcome/autorole: `/tools` or the community settings; welcome needs
      `GuildMembers`.
- [ ] AutoMod: native rules can be recreated in Discord; Keystone's scanner is
      opt-in and dry-run first.
- [ ] Cases: keep Dyno's export/screenshots as an external record; Keystone starts
      its own numbered ledger.

**Lost:** historical cases, Dyno's exact automod thresholds, dashboard-only
toggles. Do not claim a migration that has no source file.

## Carl-bot → Keystone

**Transfers:** tags are the narrow exception. Carl-bot has a tag import page; if
it gives you a file, map `name`/`content` into community records with the
`tag` kind. Reaction roles, logs, welcome and automod have no general export.

**Guided rebuild:**

- [ ] Reaction roles: create panels with `/tools roles`; role ids must be from
      this guild.
- [ ] Tags: recreate the small set that matters; bulk import is a P7 content
      feature, not a promised migration.
- [ ] Logs: recreate channel ids and event toggles.
- [ ] Automod: rebuild keyword/regex rules deliberately; test in dry run.

**Lost:** tag usage counts, historical cases, Carl-bot's scheduling state.

## Wick → Keystone

**Transfers:** nothing. Server imaging is not a portable config format and Wick
has no API.

**Guided rebuild:** anti-nuke thresholds, quarantine role, verification gate,
panic mode (P7), audit retention. Keep Wick's incident notes externally. Do not
promise "Wick restore"; it would be a fabrication.

## Keystone → Keystone

```bash
pnpm portability export <guildId> ./backup.json
pnpm portability import ./backup.json <destinationGuildId> --mode replace --yes
```

`replace` is full fidelity. `--mode merge --levels keep-higher` imports settings
and levels only and leaves destination history alone. A failed restore rolls
back; an applied one can be reverted for 24 hours with
`pnpm portability rollback <importId>`.

## What no migration can carry

- Discord messages and attachments the old bot did not store in a file;
- another bot's internal database or analytics;
- another server's data without an owner-authorised export;
- live tickets, live giveaways, live temp channels;
- credentials, tokens or OAuth grants.

If a guide would need one of those, it says "recreate", not "import". That is the
difference between a migration and marketing.
