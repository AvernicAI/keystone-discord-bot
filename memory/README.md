# /memory

This folder is the project's brain, and it ships with the bot. It has two halves
that are checked against each other on every `pnpm check`:

```
memory/
  vault/     human half — open this folder in Obsidian
  machine/   machine half — project.json, read by agents and scripts
  journal/   one entry per work pass: what changed, what was rejected, why
  tools/     memory-check (integrity) and pass-end (the ritual)
```

## Open the vault

Obsidian → **Open folder as vault** → select `memory/vault`. Start at
`00-Index/Home.md`. Wikilinks work out of the box; there are no plugins to install.

## Read it as an agent

1. `memory/machine/project.json` — current phase, modules, decisions, open questions.
2. `memory/journal/` — newest first. The "tried and rejected" sections are the
   most useful part: they stop you re-litigating settled choices.
3. `memory/vault/03-Architecture/` — how the system fits together.
4. `memory/vault/04-Modules/<id>/Spec.md` — what a module must do.

## Rules

- **Memory that lies is worse than no memory.** Every module folder must be
  listed in `project.json`, and every listed module must have a spec and a status
  doc. `pnpm memory:check` enforces both directions.
- **Every pass ends with a journal entry.** `pnpm pass:end` scaffolds it.
- **"Tried and rejected" is mandatory.** A decision without its alternatives is
  folklore, not engineering, and it teaches nobody.
- **Never paste secrets here.** The vault is public when the repo is public.
