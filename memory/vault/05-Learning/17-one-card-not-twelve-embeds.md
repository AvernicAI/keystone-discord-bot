# Lesson 17 — One card, not twelve embeds

**Code:** `modules/moderation/src/format.ts`, `apps/bot/src/adapt.ts`,
`modules/moderation/src/case-panel.test.ts`, `apps/web/src/settings-form.ts`,
`apps/web/src/pickers.test.ts`

## The problem

The moderation module drew its case three times, by hand, in one file:

```ts
// the old format.ts, in spirit
function caseEmbed(record) {
  return {
    title: `Case #${record.caseNumber}`,
    color: 0x5865f2,              // a colour with no source
    fields: [
      { name: "Action", value: record.action, inline: true },
      { name: "Target", value: `<@${record.targetId}>`, inline: true },
      { name: "State", value: record.state, inline: true },
      { name: "Actor", value: `<@${record.actorId}>`, inline: true },
      { name: "Rule", value: record.rule ?? "manual", inline: true },
      { name: "Case", value: String(record.caseNumber), inline: true },
    ],
  };
}
```

It is fine code. The problem is the number of copies and what each copy forgets.
By pass 84 the same case was drawn from a dozen call sites: `/mod case`, every
`/mod` action reply, `/mod history`, `/mod review`, the case-history user menu,
both appeal subcommands, the security alert, the temporary-action release and
the placeholder that stands in when moderation is not wired. The copies drifted:
one had a footer, one had a reason, one coloured a reversal blue, none said when
the read happened, and the appeal button was an `ActionRow` built *outside* the
embed, which is how a forwarded screenshot ends up showing the record without
the action it offers.

The same shape of mistake appears in the dashboard. A settings schema stores
`channelId` and `roleId` as strings, so the editor rendered a text box and the
operator was expected to turn on Discord's Developer Mode and copy a snowflake.
The ids are usually right. Occasionally one is a channel from another server, or
from this server last month, and the form only finds out when the bot silently
fails to log.

Neither problem is about Discord's API. Both are about where the presentation
lives.

## Our version

**One builder per surface, not per call site.** `format.ts` exposes three:

```ts
export function casePanel(record: ModerationCase, options: CasePanelOptions = {}): V2Component[]
export function caseListPanel(records: readonly ModerationCase[], title: string, options: CaseListOptions = {}): V2Component[]
export function appealStatusPanel(entries: readonly CaseEvent[], title: string, options: CaseListOptions = {}): V2Component[]
```

Twelve call sites now pass a record and options; none of them knows a component
type. The panel itself follows the shared grammar: an accent chosen by state, one
heading, one facts line, the reason, a footer with a read stamp and exactly one
action row.

```ts
ui.container({ accentColor: options.accent ?? caseAccent(record) }, (box) => {
  box.text(heading({ glyph: GLYPHS.shield, title: `Case #${record.caseNumber} · ${record.action}` }));
  box.text(caseFacts(record));                       // target · actor · state · expiry
  box.separator({ spacing: "small" });
  box.text(`**Reason**\n${reason}`);
  box.text(footer([readStamp(readAt, `case #${record.caseNumber} · events are append-only`)]));
  actionRow(box, ui, buttons);                        // inside the container
});
```

Two details are deliberate. The state is written in the facts line as well as
coloured, because a screenshot cannot distinguish "closed" from "reversed" if the
only signal is the accent. And the action row has at most one primary: a join-gate
case offers Verify first and steps Appeal down to secondary, so a reader is never
looking at two "do this" buttons.

**The kernel carries layout; the adapter owns the wire flag.** A message that
uses Components V2 must send `IsComponentsV2` and must not also carry `content`
or `embeds`; Discord rejects the combination. That flag is a discord.js detail,
and the kernel must not import discord.js. So `ModerationNotice` gained a `v2`
field, and the conversion lives beside the only other discord.js code:

```ts
// apps/bot/src/adapt.ts
export function toChannelMessage(notice: ModerationNotice): MessageCreateOptions {
  if (notice.v2) {
    return { components: toV2Components(notice.v2), flags: MessageFlags.IsComponentsV2 };
  }
  return { embeds: notice.embeds as never, components: [] };
}
```

The mod-log message can now be the same card the moderator sees, without a
second renderer in a second process. One test feeds a card through
`toChannelMessage` and checks the flag and the absence of `content`; the same
test checks that an embed-only caller still gets the legacy shape, because "we
migrated everything" is a claim that decays.

**A picker is a read, not a text box.** The settings schema does not change: an
id is still a string, and validation is still the module's own Zod schema. The
form model adds one derived fact:

```ts
export function referenceFor(key: string): "channel" | "role" | undefined {
  if (/channelid$/i.test(key)) return "channel";
  if (/roleid$/i.test(key)) return "role";
  return undefined;                    // djRoleIds is a list; a picker would drop entries
}
```

When the page process has a directory port, the renderer asks it for this
server's channels and roles and draws a `<select>` with `<optgroup>` per
category: `# general`, `🔊 Lounge`, `@Moderator`. When it does not, the field
stays a text input and a sentence names the Directory page. A read that fails is
not an empty server: the same sentence carries the error, and the id is still
editable.

The subtlest rule is the one about ids that are not in the list:

```ts
// keep an unknown id selected and labelled instead of resetting it to None
value && !choices.some((choice) => choice.value === value)
  ? `<option value="${value}" selected>⚠ ${value} · not in this server</option>`
  : ""
```

A channel can be deleted from the directory cache's view while a setting still
points at it. Quietly rendering `None` would make the next save erase a real
setting; the honest widget shows the id the operator actually has.

## Exercise

Put the same two ideas somewhere they are not yet: `/mod note` and the logging
channel.

1. Add a `notePanel(record, note, { readAt })` builder that reuses `casePanel`'s
   facts line and footer and adds the note as its own section. `/mod note` must
   return it instead of the plain confirmation string.
2. Make `logging.channelId` default to the picker. Confirm the form model
   already marks it (it ends in `ChannelId`) and that a role field groups
   `@everyone` separately from assignable roles.
3. Add a test that a stored `channelId` missing from the directory stays selected
   and labelled, and a test that a `djRoleIds` list is still a text field.
4. Run the checks below and read the `audit:visuals` line: the case surface has
   no live proof, so it cannot be graded `A` no matter how good the code looks.

```bash
pnpm test -- modules/moderation/src/case-panel.test.ts apps/bot/src/channel-message.test.ts apps/web/src/pickers.test.ts
pnpm audit:visuals
```

Then answer: if the kernel owned the `IsComponentsV2` flag, which file would
import discord.js next, and what would that break?

## What we rejected

- **Three hand-written embeds kept in sync by review.** They were already out of
  sync; a fourth caller would have made it four. A builder is smaller than the
  test that catches drift.
- **`MessageFlags` in `@keystone/kernel`.** One constant is not worth importing
  discord.js into the layer that tests without a token and runs in the worker.
- **Sending both `v2` and `embeds` "just in case".** Discord rejects it; a
  fallback that only fires after a 400 is not a fallback.
- **The appeal button beside the card.** The original layout had it outside the
  embed because embeds cannot contain buttons. A forwarded screenshot then shows
  a record with no visible next step. The action row lives inside the container.
- **A free-text channel name field for the picker.** Names change and are not
  unique; the id is the only stable handle. The picker shows the name and
  submits the id.
- **Resetting an unknown stored id to `None`.** It hides a broken reference and
  turns the next unrelated save into a destructive one.
- **A picker for every string ending in `Id`.** `djRoleIds` is a list, and a
  single-value control would silently keep one entry of it.

## Check yourself

1. Why is `caseAccent` a function of the record while the dry-run line is an
   option, even though both are "presentation"?
2. `toChannelMessage` deletes neither `content` nor `embeds`; it builds a new
   object instead. Why is that safer than mutating the notice?
3. The picker's "not in this server" option is selected on the server and shown
   to the browser. What would go wrong if the renderer instead emitted the raw
   id value with no label?
4. A directory read returns 403. Trace what the operator sees, what the form
   submits, and what the bot does with that id.
5. The case surface is graded `B` with unit tests and no live proof. Name the one
   check that would justify an `A`, and the one thing it still cannot prove.
