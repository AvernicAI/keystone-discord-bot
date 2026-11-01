# The command budget

Discord allows **100 global chat-input commands per application**. That is not a
lot for a bot that wants to replace four others, and it is the constraint most
likely to be discovered too late.

This is why `pnpm budget` exists, why `pnpm check` runs it, and why the bot
refuses to boot when it fails.

## Current ledger

```text
14/100 global roots used (86 left)
90 subcommands · 104 total actions
status: OK

  /command    module       subs  opts  chars
  /ai         ai             11     2   1954
  /analytics  analytics       6     1   1539
  /rank       community      12     2   2108
  /ticket     community       8     2   1450
  /tools      community      24     5   7224
  /about      diagnostics     0     0    131
  /help       diagnostics     5     1    816
  /ping       diagnostics     0     0    103
  /invites    invites         3     1    672
  /logging    logging         7     2   1606
  /appeal     moderation      0     2    282
  /mod        moderation     14     4   3991
  /verify     moderation      0     0    120
  /setup      setup           0     0    130
```

`pnpm budget` prints the live table. It is the source of truth; this page only
explains the shape of the number, not the number itself.

A **root** is one of Discord's 100 global chat-input commands. A **subcommand**
is free: it lives inside its root and does not consume another slot. Pass 26
replaced the flat `action` option in every existing hub with real subcommands, so
`/mod ban` and `/rank daily` are now visible in Discord's picker. The generated
[[Command-Catalog]] is the complete per-root list.

P4's economy work reused `/rank`; `/ai` was its only new root. A second economy
root was rejected in [[ADR-0011-economy-ledger-and-double-spend]] because it
would duplicate the hub and spend a command for no user benefit.

## How to spend a command

**Prefer, in order:**

1. **A subcommand group on an existing hub** — `/config levels xp 15`.
   Costs zero new global commands.
2. **A context-menu command** — right-click a message → Apps → *Report*.
   Separate budget: 15 user + 15 message.
3. **A component** — button/select on a panel. Costs component slots, not commands.
4. **A new root command** — last resort, and it needs a line in this ledger.

**Never:**

- One root command per feature (`/ban`, `/kick`, `/warn`, `/mute`, `/unmute`…).
  That is five of a hundred spent on one module.
- Deep nesting. Discord allows exactly one level: group → subcommand. A group
  inside a group is invalid and fails registration.
- Long descriptions "for clarity". The whole payload, localisations included,
  caps at 8,000 characters.

## The hub layout we are building toward

| Root | Owns | Example |
| --- | --- | --- |
| `/setup` | onboarding, module toggles, import | `/setup import mee6` |
| `/config` | every module's settings | `/config levels xp 15` |
| `/mod` | cases, warnings, timeouts, bans | `/mod case view 42` |
| `/ticket` | panels, claiming, transcripts | `/ticket panel create` |
| `/rank` | leveling and economy | `/rank view @user` |
| `/tools` | embeds, giveaways, reminders, feeds | `/tools embed edit` |
| `/help` | discovery, generated from the registry | `/help moderation` |

Fourteen roots today for a bot with dozens of implemented actions. The remaining
86 slots are held for context menus, Activities, and features that genuinely
need their own name. `/help`, `/setup`, `/logging` and `/analytics` are roots;
`/config`, `/export` and `/music` arrive with their modules, not as empty
advertisements.

## Component budget (the other 100-limit)

Components V2 allows **40 components per message, total**, and the flag is
irreversible once set. A panel with a container, three text displays, two
separators and four action rows has already spent ten slots.

`packages/ui` (P1) will expose `layout()` that counts slots as it builds and
throws in development when a panel exceeds 40. Until then, the rule is: a panel
is one container, at most four action rows, and no nested sections for decoration.

## Anti-patterns with receipts

- **MEE6** ships a `/` namespace per plugin and a separate AI subscription. It is
  the cautionary tale for command sprawl and for pricing the core.
- **"500+ commands"** repos use command count as marketing. Users cannot find
  anything, and the maintainers cannot deprecate anything.
- **Prefix + slash duplication** doubles the name surface for no user benefit and
  requires the message-content intent. Slash-first; prefix is opt-in, later, and
  clearly labelled.

## When we hit 80

`pnpm budget` warns at 80. At that point the policy is:

1. Convert any single-purpose roots into subcommands of their hub.
2. Move configuration into `/config` rather than `/feature-config`.
3. Only then consider whether a new root is genuinely earned.

The number in `memory/machine/project.json` must match `commands` in the report.
`pnpm memory:check` enforces that it stays under the limit.
