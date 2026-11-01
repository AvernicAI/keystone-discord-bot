# The command budget

Discord allows **100 global chat-input commands per application**. That is not a
lot for a bot that wants to replace four others, and it is the constraint most
likely to be discovered too late.

This is why `pnpm budget` exists, why `pnpm check` runs it, and why the bot
refuses to boot when it fails.

## Current ledger

```
10 / 100 global commands used (90 left)
status: OK

/command   module        opts  chars
/about     diagnostics      0    102
/ai        ai               7   1087
/appeal    moderation       2    253
/mod       moderation       8   1203
/ping      diagnostics      0     74
/rank      community        8   1190
/setup     setup            0    101
/ticket    community        6    811
/tools     community       10   1753
/verify    moderation       0     91
```

`pnpm budget` prints the live table. It is the source of truth; this page only
explains the shape of the number, not the number itself.

P4's economy work reuses `/rank`; `/ai` is its only new root, so the ledger moved
from 9 to 10. A second economy root was rejected in [[ADR-0011-economy-ledger-and-double-spend]]
because it would duplicate the hub and spend a command for no user benefit.

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

Seven roots for a bot with forty features. With four standalone roots that is 11
of 100; the remaining 89 are held for
context menus, Activities, and features that genuinely need their own name.

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
