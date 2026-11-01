# RFC — <feature>

**Pass:** <pass-id> · **Phase:** <P4.5–P10> · **Owner:** <specialist>

## The problem

What fails today, for whom, and what named bot or paid feature does this replace?

## The eight vetoes

| Role | Question | Answer |
| --- | --- | --- |
| Parity lead | Which bot does this let an admin uninstall? | |
| Platform engineer | Which limit does it spend: commands, components, intents, rate? | |
| Data engineer | Can it be exported, restored and deleted? | |
| Dashboard/API | Can a user reach another guild through this? | |
| Trust & safety | Can it punish someone wrongly, and can they appeal? | |
| Teaching | Can a beginner follow it in one sitting? | |
| Ops | What does it cost per 1,000 guilds, and how does it fail? | |
| Legal/open source | Can we ship it free, legally, forever? | |

## Options

1. **Do nothing.** What stays broken?
2. **Buy or host it.** What dependency and lock-in?
3. **Build it.** The proposed shape.

## The leading option

What it is, what it touches, what it refuses to do.

## Verification

The demo, the tests, and what remains unproven without a live service.

## Rejected alternatives

At least one alternative and why it lost. This is mandatory.
