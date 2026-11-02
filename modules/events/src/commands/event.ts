import { createHash } from "node:crypto";
import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
  type CommandOption,
  type EventDefinition,
  type EventSummary,
} from "@keystone/kernel";
import { EventService, type EventExport } from "../events";
import { eventSettingsSchema } from "../settings";

const OPTIONS = {
  name: { type: "string", name: "name", description: "Event name shown in the list" },
  key: { type: "string", name: "key", description: "Stable slug; defaults from the name" },
  description: {
    type: "string",
    name: "description",
    description: "Short description shown on the event",
  },
  starts: {
    type: "string",
    name: "starts",
    description: "Start, e.g. 2026-11-05T18:00:00Z",
  },
  ends: {
    type: "string",
    name: "ends",
    description: "Optional end, same format as starts",
  },
  location: {
    type: "string",
    name: "location",
    description: "Where it happens: a channel, an address or voice stage",
  },
  capacity: {
    type: "integer",
    name: "capacity",
    description: "Maximum going; 0 means unlimited",
    minValue: 0,
    maxValue: 5_000,
  },
  event: { type: "string", name: "event", description: "Event key or id" },
  eventRequired: {
    type: "string",
    name: "event",
    description: "Event key or id",
    required: true,
  },
  confirm: {
    type: "string",
    name: "confirm",
    description: "Repeat the event key to confirm deletion",
  },
  rsvp: {
    type: "string",
    name: "rsvp",
    description: "Your answer for this event",
    choices: [
      { name: "going", value: "going" },
      { name: "not going", value: "not_going" },
    ],
    required: true,
  },
  state: {
    type: "string",
    name: "state",
    description: "Draft is hidden; open takes RSVPs; closed keeps history",
    choices: [
      { name: "draft", value: "draft" },
      { name: "open", value: "open" },
      { name: "closed", value: "closed" },
    ],
  },
} satisfies Record<string, CommandOption>;

function opts(...names: (keyof typeof OPTIONS)[]): CommandOption[] {
  return names.map((name) => OPTIONS[name]);
}

function text(ctx: CommandContext, key: keyof typeof OPTIONS): string | undefined {
  const value = ctx.interaction.options[OPTIONS[key].name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function whole(ctx: CommandContext, key: keyof typeof OPTIONS): number | undefined {
  const value = ctx.interaction.options[OPTIONS[key].name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function manage(ctx: CommandContext): void {
  const held = ctx.interaction.permissions;
  if (!held.includes("ManageGuild") && !held.includes("Administrator")) {
    throw new UserError("Missing permission: ManageGuild");
  }
}

function store(ctx: CommandContext) {
  const events = ctx.events;
  if (!events) throw new UserError("Events are not wired in this process.");
  return events;
}

function clip(value: string, max = 1_024): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const seconds = (iso: string): number => Math.floor(Date.parse(iso) / 1_000);

function capacityLine(event: EventDefinition, going: number): string {
  return event.capacity === undefined
    ? `${going} going · no cap`
    : `${going}/${event.capacity} going`;
}

function eventLine(entry: EventSummary): string {
  return [
    `\`${entry.event.key}\` · **${entry.event.name}** · ${entry.event.state}`,
    `<t:${seconds(entry.event.startsAt)}:F>`,
    capacityLine(entry.event, entry.going),
    entry.notGoing > 0 ? `${entry.notGoing} not going` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function eventFields(event: EventDefinition, going: number) {
  return [
    { name: "When", value: `<t:${seconds(event.startsAt)}:F> (<t:${seconds(event.startsAt)}:R>)`, inline: false },
    ...(event.endsAt
      ? [{ name: "Ends", value: `<t:${seconds(event.endsAt)}:F>`, inline: false }]
      : []),
    { name: "Where", value: event.location || "Not set", inline: false },
    { name: "RSVPs", value: capacityLine(event, going), inline: false },
    ...(event.remindedAt
      ? [
          {
            name: "Reminders",
            value: `${event.reminderCount} · last <t:${seconds(event.remindedAt)}:R> by <@${event.remindedBy}>`,
            inline: false,
          },
        ]
      : []),
  ];
}

function exportFile(payload: EventExport, checksum: string): { content: string } {
  return { content: JSON.stringify({ ...payload, checksum }, null, 2) };
}

export const event = defineCommand({
  name: "event",
  description: "Create guild events, take RSVPs, post reminders and export attendance.",
  subcommands: [
    {
      name: "create",
      description: "Create a draft event with a start time and optional capacity.",
      options: opts("name", "key", "description", "starts", "ends", "location", "capacity"),
    },
    {
      name: "edit",
      description: "Change an event's details, capacity or draft/open/closed state.",
      options: opts("event", "name", "description", "starts", "ends", "location", "capacity", "state"),
    },
    {
      name: "delete",
      description: "Delete an event that has no RSVPs; attendance history is never deleted.",
      options: [OPTIONS.event, OPTIONS.confirm],
    },
    { name: "list", description: "List events with state, start time and RSVP counts." },
    {
      name: "rsvp",
      description: "Record your own going or not-going answer; one RSVP per member.",
      options: [OPTIONS.eventRequired, OPTIONS.rsvp],
    },
    {
      name: "remind",
      description: "Post a reminder for an open event and record who sent it.",
      options: [OPTIONS.event],
    },
    {
      name: "export",
      description: "Download events and RSVPs as a checksummed JSON file.",
      options: [OPTIONS.event],
    },
  ],
  guards: [requireGuild, cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    const settings = eventSettingsSchema.parse(await ctx.settings.get(ctx.guildId as string));
    const events = store(ctx);
    const svc = new EventService(events, settings, ctx.now);
    const guildId = ctx.guildId as string;
    const selected = ctx.commandPath[0];

    if (selected === "create") {
      manage(ctx);
      const created = await svc.create(guildId, ctx.userId, {
        name: text(ctx, "name") ?? "",
        key: text(ctx, "key"),
        description: text(ctx, "description"),
        starts: text(ctx, "starts") ?? "",
        ends: text(ctx, "ends"),
        location: text(ctx, "location"),
        capacity: whole(ctx, "capacity"),
      });
      await ctx.interaction.reply({
        content: `Event \`${created.key}\` created in draft for <t:${seconds(created.startsAt)}:F>. Open it with \`/event edit event:${created.key} state:open\`, then members can \`/event rsvp event:${created.key} rsvp:going\`.`,
        ephemeral: true,
        embeds: [
          {
            title: `Draft: ${created.name}`,
            description: created.description || "No description yet.",
            color: 0x5865f2,
            fields: eventFields(created, 0),
          },
        ],
      });
      return;
    }

    if (selected === "edit") {
      manage(ctx);
      const reference = text(ctx, "event");
      if (!reference) throw new UserError("Choose an event with the `event` option.");
      const before = await events.getEvent(guildId, reference);
      if (!before) throw new UserError(`Event \`${reference}\` was not found. Use \`/event list\`.`);

      const patch = {
        name: text(ctx, "name"),
        description: text(ctx, "description"),
        starts: text(ctx, "starts"),
        ends: text(ctx, "ends"),
        location: text(ctx, "location"),
        capacity: whole(ctx, "capacity"),
        state: text(ctx, "state"),
      };
      if (
        patch.name === undefined &&
        patch.description === undefined &&
        patch.starts === undefined &&
        patch.ends === undefined &&
        patch.location === undefined &&
        patch.capacity === undefined &&
        patch.state === undefined
      ) {
        const going = await events.countRsvps(guildId, before.id, "going");
        await ctx.interaction.reply({
          content: `Event \`${before.key}\` · ${before.state} · <t:${seconds(before.startsAt)}:F> · ${capacityLine(before, going)}. Change one of name, description, starts, ends, location, capacity or state.`,
          ephemeral: true,
          embeds: [
            {
              title: before.name,
              description: before.description || "No description yet.",
              color: 0x5865f2,
              fields: eventFields(before, going),
            },
          ],
        });
        return;
      }

      const updated = await svc.edit(guildId, reference, patch);
      const going = await events.countRsvps(guildId, updated.id, "going");
      await ctx.interaction.reply({
        content: `Event \`${updated.key}\` updated · state ${updated.state} · <t:${seconds(updated.startsAt)}:F> · ${capacityLine(updated, going)}.`,
        ephemeral: true,
        embeds: [
          {
            title: updated.name,
            description: updated.description || "No description yet.",
            color: 0x5865f2,
            fields: eventFields(updated, going),
          },
        ],
      });
      return;
    }

    if (selected === "delete") {
      manage(ctx);
      const reference = text(ctx, "event");
      const confirm = text(ctx, "confirm");
      if (!reference) throw new UserError("Choose an event with the `event` option.");
      if (!confirm) throw new UserError(`Pass confirm:${reference} to delete this event.`);
      const removed = await svc.remove(guildId, reference, confirm);
      await ctx.interaction.reply({
        content: `Event \`${removed.key}\` deleted. It had no RSVPs, so no attendance history was lost.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "list") {
      const list = await svc.list(guildId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `${list.length} event${list.length === 1 ? "" : "s"} in this server.`,
        embeds: [
          {
            title: "Events",
            description:
              list.length > 0
                ? list.map(eventLine).join("\n")
                : "No events yet. Create one with `/event create name:<name> starts:<ISO date>`.",
            color: 0x5865f2,
            footer: { text: "RSVP counts are read from event_rsvps, not a counter." },
          },
        ],
      });
      return;
    }

    if (selected === "rsvp") {
      const reference = text(ctx, "event");
      const answer = text(ctx, "rsvp");
      if (!reference) throw new UserError("Choose an event with the `event` option.");
      if (!answer) throw new UserError("Choose going or not going.");
      const outcome = await svc.rsvp(guildId, ctx.userId, reference, answer);
      const capped =
        outcome.event.capacity === undefined
          ? `${outcome.going} going`
          : `${outcome.going}/${outcome.event.capacity} going`;
      await ctx.interaction.reply({
        content: `RSVP for \`${outcome.event.key}\` recorded · ${answer === "going" ? "going" : "not going"} · ${capped}.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "remind") {
      manage(ctx);
      const reference = text(ctx, "event");
      if (!reference) throw new UserError("Choose an event with the `event` option.");
      const reminded = await svc.remind(guildId, ctx.userId, reference);
      await ctx.interaction.reply({
        content: `Reminder ${reminded.event.reminderCount} for \`${reminded.event.key}\` · <t:${seconds(reminded.event.startsAt)}:R> · ${reminded.going} going.`,
        embeds: [
          {
            title: `Reminder: ${reminded.event.name}`,
            description:
              reminded.event.description ||
              `**${reminded.event.name}** starts <t:${seconds(reminded.event.startsAt)}:R>. Use \`/event rsvp event:${reminded.event.key} rsvp:going\` to join.`,
            color: 0xfee75c,
            fields: eventFields(reminded.event, reminded.going),
            footer: { text: `Reminder sent by the event manager. ${reminded.going} going so far.` },
          },
        ],
      });
      return;
    }

    if (selected === "export") {
      manage(ctx);
      const reference = text(ctx, "event");
      const payload = await svc.export(guildId, reference);
      const checksum = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      const file = exportFile(payload, checksum);
      const name = reference
        ? `keystone.events.${guildId}.${payload.events[0]?.key ?? "event"}.json`
        : `keystone.events.${guildId}.json`;
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Event export · ${payload.counts.events} event${payload.counts.events === 1 ? "" : "s"} · ${payload.counts.rsvps} RSVP${payload.counts.rsvps === 1 ? "" : "s"} · ${file.content.length} bytes · checksum \`${checksum.slice(0, 16)}…\``,
        files: [
          {
            name,
            content: file.content,
            description: "Keystone events export. Contains member ids; keep it private.",
          },
        ],
        embeds: [
          {
            title: "Events export",
            description:
              "The attached JSON is the same rows `/event list` and `/event rsvp` read, plus the RSVP membership. The checksum is SHA-256 over the payload.",
            color: 0x5865f2,
            fields: [
              { name: "Checksum", value: `\`${checksum}\``, inline: false },
              { name: "Format", value: `\`${payload.format}\` version ${payload.version}`, inline: false },
            ],
            footer: { text: "Contains member ids. Treat it as private." },
          },
        ],
      });
      return;
    }

    throw new UserError("Unknown event action. Use `/event list`.");
  },
  help: {
    category: "Community",
    permissions: ["ManageGuild"],
    examples: [
      "/event create name:Launch night starts:2026-11-05T18:00:00Z capacity:25",
      "/event edit event:launch-night state:open",
      "/event rsvp event:launch-night rsvp:going",
      "/event remind event:launch-night",
      "/event export event:launch-night",
    ],
  },
  notes:
    "RSVPs are owned by the invoking member: there is no user option, so no command can write another member's row. Capacity is counted from event_rsvps inside the store, so two members cannot both take the last seat. `remind` records who sent it and when; it does not schedule future delivery.",
});
