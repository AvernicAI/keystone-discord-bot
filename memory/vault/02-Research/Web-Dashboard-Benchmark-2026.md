# Web dashboard benchmark — 2026

**Retrieved:** 2026-11-05
**Question:** what do the top Discord bots' dashboards do that Keystone's does not,
and where is their documented behaviour weak enough to beat honestly?

**How to read this:** every row below names a primary source I read on the date
above. Two claims from the earlier plan did not survive that reading and are
recorded as corrections, not quietly repeated. Nothing here is a screenshot
comparison: a design claim needs either a vendor page or a public issue thread.

## Table stakes

| Pattern | Who proves it (source) | Keystone before pass 78 |
| --- | --- | --- |
| Module gallery grouped by job, with a toggle | [Dyno's 33 module cards in 6 categories](https://docs.dyno.gg/en/modules); MEE6 and ProBot ship module lists | one long overview with settings links |
| A real permission gate that is not Administrator | none of the surveyed vendors; Keystone already accepts **Manage Server** | already shipped |
| Explicit save state | Dyno, ProBot and Helper.gg document save buttons; Carl-bot has a long-running failure thread | save worked, with no dirty or saved context |
| Recent admin activity | Dyno and Ticket Tool expose audit/history surfaces | per-module only |
| Readiness / "issues to fix" | [Wick's overview lists issues to fix](https://docs.wickbot.com/faq) | none |
| Analytics with coverage honesty | [Statbot retains data but windows viewing to 30 days free](https://docs.statbot.net/docs/faq/general/delete-data) | tables with a coverage note, no strip naming off switches |
| Channel/role pickers instead of ids | [Ticket Tool's setup says "select the channel"](https://docs.tickettool.xyz/general/setup); [Wick's wizard](https://docs.wickbot.com/setup/) accepts mentions, names or ids | text fields with no directory |
| Setup checklist | [Wick's overview](https://docs.wickbot.com/faq), Carl's quick-start, MEE6's onboarding | none |

## Documented behaviour worth beating

### 1. The Administrator wall is real

MEE6's own wiki says Manage Server is enough to invite the bot but **not** to
open the dashboard: "it will not allow you to see the MEE6 Dashboard. For that,
you must have the 'Administrator' permission or be the server owner."
([wiki.mee6.xyz](https://wiki.mee6.xyz/getting-started);
[help center](https://help.mee6.xyz/en/articles/605739-mee6-isn-t-showing-the-servers-i-have)
repeats it: "Having the 'Manage Server' permission is not enough — only the full
Administrator permission counts.")

ProBot is the same: "You need Administrator permission to see your server on the
list." ([docs.probot.io](https://docs.probot.io/docs/getting-started/dashboard))
Ticket Tool's FAQ agrees: "you need the Administrator permission to edit its
configuration in the Dashboard."
([docs.tickettool.xyz](https://docs.tickettool.xyz/debugging/faqs))

**Keystone's position:** Administrator is not required. The dashboard lists a
server when the signed-in account owns it or holds **Manage Server**, and every
write additionally passes the guild's own settings schema and audit trail. That
is a real product difference, and the landing page now says it in one sentence.

### 2. Paywall creep is documented, but be precise

MEE6's own free-vs-premium table marks **Reaction Role**, **Welcome & Goodbye**
and **XP and Levels** as unavailable on Free, with Moderation also gated in the
same table. ([help.mee6.xyz comparison](https://help.mee6.xyz/en/articles/710936-mee6-free-vs-premium-plans-comparison),
portal metadata dated 2026-06-16.)

**Correction:** the page documents *current* gating. It never says these
features were formerly free, and third-party blogs disagree about whether
moderation is still free. Do not write "MEE6 moved moderation behind Premium" as
fact; write "MEE6's own comparison table lists moderation among Premium-only
features."

**Keystone's position:** no paid tier exists in the schema, the command registry
or the dashboard. That is checkable, not marketing.

### 3. Silent saves are a real, long-lived failure

Carl-bot's `CarlGroth/Carl-Bot` issue **#50**, "Reaction roles on the website
doesn't work", has been open since **2022-06-30**. Its newest comment
(**2025-12-15**) is the sentence every dashboard should fear: "Every time I
click save, nothing happens."
([github.com/CarlGroth/Carl-Bot/issues/50](https://github.com/CarlGroth/Carl-Bot/issues/50))
A newer issue, #68 "Progress Not Saving", was opened 2026-08-02.

**Correction:** the canonical issue title is about reaction roles not being
created, not about Save. The "nothing happens" quote is the latest comment, and
comments do not continue into 2026.

**Keystone's position:** a settings save returns with a notice that names the
module, the dotted keys written and the activity ledger row; a rejected save
re-renders the submitted value and the schema error. The module toggle now
reports its new state and links to the same ledger.

### 4. Raw ids are friction — but Ticket Tool already fixed it

**Correction:** the plan claimed Ticket Tool requires Developer Mode and pasted
channel ids. Its current setup page uses in-dashboard pickers ("select the
channel you want your panel to be sent to"), and no page on docs.tickettool.xyz
that was read mentions Developer Mode. Wick's wizard accepts a `#mention`, name
or id. Treat "top bots require raw ids" as **false for 2026**.

The remaining gap is real for Keystone: its schema-driven editor still shows
`channelId` and `roleId` text fields, because the editor is generated from the
settings schema with no directory access. Pass 78 adds a read-only directory so
the ids can be found without Developer Mode; a picker wired into the form is the
next step.

### 5. Readiness is a pattern with one implementation worth copying

Wick's dashboard overview "will give a list of issues to fix, systems overview
and some other things". ([docs.wickbot.com/faq](https://docs.wickbot.com/faq))

Keystone does not copy the score. It computes four facts from settings the bot
actually reads — is a log channel set, is automod on, is a ticket category set,
are welcome messages on — and links each unfinished fact to the editor that
fixes it. No number is invented and nothing is called "health" that is not a
setting.

### 6. Analytics needs coverage, not bigger numbers

Statbot "never deletes data", but Free users "can only view data up to 30 days
back", and default views are 14 days.
([delete-data](https://docs.statbot.net/docs/faq/general/delete-data),
[settings](https://docs.statbot.net/docs/guide/settings))
It also starts tracking at invite time, not retroactively.

Keystone's bounded 1–90 day window is the same shape. Pass 78 adds the missing
piece: the dashboard names which retained sources contributed zero rows and
why a zero can mean "the logging event or module is off".

## What this means for the product

The market's weak points are not feature lists. They are the first five minutes:

1. **Finding** the module that does the job.
2. **Turning it on** without reading a docs page.
3. **Knowing** what is still unconfigured.
4. **Trusting** that a save happened and who made it.
5. **Finding** a channel or role without Developer Mode.

Pass 78 builds those five. The next dashboard pass should make channel and role
fields into pickers, because that is the one table-stakes row where the
benchmark says the leaders are genuinely better and our editor is not.

## Sources read

- https://wiki.mee6.xyz/getting-started
- https://help.mee6.xyz/en/articles/605739-mee6-isn-t-showing-the-servers-i-have
- https://help.mee6.xyz/en/articles/710936-mee6-free-vs-premium-plans-comparison
- https://docs.dyno.gg/en/modules
- https://docs.dyno.gg/en/dashboard/settings
- https://github.com/CarlGroth/Carl-Bot/issues/50
- https://docs.tickettool.xyz/general/setup
- https://docs.tickettool.xyz/debugging/faqs
- https://docs.probot.io/docs/getting-started/dashboard
- https://docs.probot.io/docs/getting-started/faq
- https://docs.wickbot.com/faq
- https://docs.wickbot.com/setup/
- https://docs.statbot.net/docs/faq/general/delete-data
- https://docs.statbot.net/docs/guide/settings
