# Lesson 15 — a dashboard that is a product, not a settings dump

## The problem

A Discord bot's dashboard is the first place an operator decides whether the bot
is trustworthy. The code behind it is usually a pile of forms that post to the
same settings service the slash commands use. Each page grew its own heading,
its own colours, its own "no data" paragraph, and its own idea of whether a save
worked.

The result is not a bug in any one page. It is that the product has twelve
first impressions, and none of them can answer four questions quickly:

- What can this bot do?
- What is switched on in **this** server?
- What is still unconfigured?
- Did my last action happen, and who can see that it did?

## The naive version

```ts
// one route per page, each with its own shell
return `<html><body><h1>Settings</h1>${inputs}<button>Save</button></body></html>`;
```

It works until there are sixteen pages. Then every page needs its own fix for
mobile layout, focus rings, an account menu and a footer. The CSP accumulates
exceptions. A save returns a bare `204`, so the operator reloads to find out
whether it worked. And a channel setting is a text box that asks for a
snowflake, which sends the operator to Discord's Developer Mode instructions.

## Our version

Read `apps/web/src/shell.ts`, `apps/web/src/theme.ts`,
`apps/web/src/directory.ts`, `apps/web/src/readiness.ts` and
`apps/web/src/routes/dashboard.ts`.

### One shell, one palette

`renderShell(chrome, body)` owns the document: skip link, top bar, account menu,
breadcrumbs, optional guild sidebar, page heading, footer. A page supplies a
title, an eyebrow, a lede, actions and a body. It cannot forget the footer,
because it does not write one.

`theme.ts` imports `ACCENTS` from `@keystone/ui` and derives every CSS variable
from it. The Discord panels and the web pages therefore agree on what green,
amber and red mean. There is no second palette to drift. `scripts/audit-visuals.ts`
fails the gate when a web surface writes a raw hex colour.

### A catalog grouped by job, with a toggle that reports itself

`groupModules` turns the module list into four groups — Safety, Community,
Support, Operations — and the overview renders each module as a card with one
**Configure** link and one enable/disable form. The toggle is a POST route that
calls the same `SettingsService` the slash command uses, writes the same audit
row, and redirects with a notice naming the module and its new state. The
operator does not have to infer that the click worked.

### Readiness is computed, never scored

`buildReadiness` is a pure function over settings the bot already reads:

```ts
buildReadiness({
  modules,
  logging: loggingSettings,
  moderation: moderationSettings,
  tickets: ticketSettings,
  community: communitySettings,
});
```

Each item is `done` or not, with a label, a detail and the href that fixes it.
There is no percentage and no "health score" that can shame a server for a
choice it made on purpose. An operator can disagree with a checklist item; they
cannot disagree that a log channel is empty.

### A directory port, and a page that only reads

`DirectoryPort` describes the two calls the dashboard needs:

```ts
export interface DirectoryPort {
  channels(guildId: string): Promise<readonly DirectoryChannel[]>;
  roles(guildId: string): Promise<readonly DirectoryRole[]>;
}
```

`DiscordDirectoryClient` implements it with a bot token and `fetch`. It is the
only new place in `apps/web` that talks to Discord, and it never writes. The
page sorts categories, marks channels the bot cannot post in, and names what it
could not read instead of rendering an empty list. In memory mode or without a
token, the port is absent and the page says so.

The directory exists because the settings editor is generated from Zod schemas
and therefore has only text inputs. The honest first step is "here are the ids,
without Developer Mode"; the next step is a picker bound to this port.

### The activity ledger is the same rows the API reads

`GET /dashboard/guilds/:id/activity` renders the newest audit events for the
guild — the same `audit_events` rows every accepted write appends, not a second
feed. Each row names the actor, the surface, the module and the keys that
changed. A settings save and a module toggle are therefore visible in one place,
which is what makes "nothing happened" answerable.

### Every page renderer is in the visual ledger

`memory/machine/surfaces.json` carries a `web` row for each page family. The
audit scans `render.ts` for `export function render...` and fails when a
renderer has no row, so a new page cannot ship ungraded. A web row's route must
start with `/`, it must have the shell footer, and its file may not hard-code an
accent. An A grade still needs a browser proof with a date.

## Exercise

Run the dashboard tests:

```bash
pnpm test -- apps/web/src/shell.test.ts apps/web/src/directory.test.ts apps/web/src/readiness.test.ts
pnpm audit:visuals
```

Then make a small change that the gate catches:

1. Add a `renderNothing()` export to `apps/web/src/render.ts` that returns a
   page using `renderShell`.
2. Run `pnpm audit:visuals`. It fails because the new renderer is in the code
   but not in `surfaces.json`.
3. Add a `web` row naming `renderNothing`, run the audit again, and read the
   weakest-surface line it prints.
4. Delete both changes.

The lesson is the direction of truth: the ledger describes the code, and the
code cannot grow a page the ledger does not know about.

## What we rejected

**A client-side framework.** The dashboard has no client JavaScript, no build
step for the page layer and a CSP of `default-src 'none'` plus images from the
Discord CDN. React would buy interactivity we have not designed yet and cost a
second rendering model, a hydration budget and a supply chain. The one
interaction that needs better ergonomics — picking a channel — can be a
server-rendered `<select>` fed by the directory port.

**Copying Wick's score.** A numeric health score is easy to render and hard to
defend. It hides which fact is missing and invites arguing with the number
instead of fixing the setting. Four named facts with four fix links do more
work with less machinery.

**A second analytics table.** A dashboard counter would be fast and would
eventually disagree with the audit ledger. The page queries the same sources the
command does and prints their row counts; slowness is bounded by indexes, not by
a copy of the truth.

**Rendering raw ids in the footer forever.** The directory is a read-only
bridge, not the destination. The destination is a schema-aware picker, and the
course should say so before a reader assumes the text field is the design.

## Check yourself

- Why does `renderShell` take trusted HTML for `actions` but escape every other
  value?
- Which function decides that a server is "ready", and what inputs can it read?
- What exactly fails when a new `render...` export has no ledger row?
- Why is the directory read-only, and what would it take to make it a picker?
- Where does an accepted settings write become visible to an operator, and which
  store holds that record?
- Can a dashboard page introduce a colour that the Discord panels do not have?
  What stops it?

## Next

The benchmark's one clear loss is channel and role selection. Wire the directory
port into `settings-form.ts` as a picker with a text fallback, prove it with a
rendered form test and a browser run, and move `web.settings` from B to A in the
ledger.
