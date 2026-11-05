import {
  requirePanelSigner,
  type EmbedPayload,
  type EventDefinition,
  type PanelSigner,
  type ReplyInput,
} from "@keystone/kernel";

/** Going and not-going counts read from `event_rsvps`, never a cached number. */
export interface EventPanelCounts {
  readonly going: number;
  readonly notGoing: number;
}

export interface EventPanel {
  /** The one reply shape both the command path and the tick post. */
  readonly reply: ReplyInput;
  /** The instant the signed buttons stop working. */
  readonly expiresAt: number;
  readonly counts: EventPanelCounts;
}

export interface EventPanelOptions {
  /** E.g. "Event open" or "Reminder 2"; prepended to the panel line. */
  readonly heading?: string;
  /** Overrides the default footer copy. */
  readonly footer?: string;
}

/**
 * The number of seconds a panel is a real control.
 *
 * A pinned event announcement is expected to work until the event is over, not
 * for the fifteen minutes a form modal lives. The id still expires: ten years
 * is the ceiling, so a leftover panel from an old event cannot accept an RSVP
 * forever, and a minimum of an hour keeps a just-started event clickable. The
 * service's open-state check remains the real gate; the expiry only retires an
 * abandoned message.
 */
export function eventPanelTtlMs(event: EventDefinition, now: number): number {
  const endsAt = Date.parse(event.endsAt ?? event.startsAt);
  const until = Number.isFinite(endsAt) ? endsAt : now;
  return Math.min(
    Math.max(until - now + 24 * 60 * 60_000, 60 * 60_000),
    10 * 365 * 24 * 60 * 60_000,
  );
}

const seconds = (iso: string): number => Math.floor(Date.parse(iso) / 1_000);

export function capacityLine(event: EventDefinition, going: number): string {
  return event.capacity === undefined
    ? `${going} going · no cap`
    : `${going}/${event.capacity} going`;
}

/**
 * Build the interactive event panel: one embed of the same rows `/event list`
 * reads, plus two signed buttons whose ids carry the event id and an expiry.
 *
 * The buttons are minted here, next to the copy, so `/event edit state:open`,
 * `/event remind` and the 60-second tick all post the identical control. The
 * route on the other side calls `EventService.rsvp`, which owns the open-state
 * and capacity rules; the panel cannot grant a seat the service would refuse.
 */
export function buildEventPanel(
  event: EventDefinition,
  counts: EventPanelCounts,
  signer: PanelSigner | undefined,
  now: number,
  options: EventPanelOptions = {},
): EventPanel {
  const signed = requirePanelSigner(signer);
  const ttlMs = eventPanelTtlMs(event, now);
  const customId = (action: "going" | "not_going"): string =>
    signed.sign({ namespace: "event", action, payload: event.id, ttlMs }, now);

  const embeds: EmbedPayload[] = [
    {
      title: `${options.heading ? `${options.heading}: ` : ""}${event.name}`,
      description: event.description || "No description yet.",
      color: 0x5865f2,
      fields: [
        {
          name: "When",
          value: `<t:${seconds(event.startsAt)}:F> (<t:${seconds(event.startsAt)}:R>)`,
          inline: false,
        },
        ...(event.endsAt
          ? [
              {
                name: "Ends",
                value: `<t:${seconds(event.endsAt)}:F>`,
                inline: false,
              },
            ]
          : []),
        { name: "Where", value: event.location || "Not set", inline: false },
        {
          name: "RSVPs",
          value: `${capacityLine(event, counts.going)}${
            counts.notGoing > 0 ? ` · ${counts.notGoing} not going` : ""
          }`,
          inline: false,
        },
      ],
      footer: {
        text:
          options.footer ??
          "One RSVP per member. A decline frees a seat; capacity counts Going.",
      },
    },
  ];

  const disabled = event.state !== "open";
  const reply: ReplyInput = {
    content: `${options.heading ? `${options.heading} · ` : ""}**${event.name}** · <t:${seconds(event.startsAt)}:F> · ${capacityLine(event, counts.going)}`,
    embeds,
    components: [
      {
        type: "action-row",
        components: [
          {
            type: "button",
            customId: customId("going"),
            label: "Going",
            style: "success",
            ...(disabled ? { disabled: true } : {}),
          },
          {
            type: "button",
            customId: customId("not_going"),
            label: "Not going",
            style: "secondary",
            ...(disabled ? { disabled: true } : {}),
          },
        ],
      },
    ],
  };

  return { reply, expiresAt: now + ttlMs, counts };
}
