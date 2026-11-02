import { defineModule } from "@keystone/kernel";
import { event } from "./commands/event";
import { eventDefaultSettings, eventSettingsSchema } from "./settings";

/**
 * Guild events.
 *
 * One root, seven subcommands. The module owns the lifecycle, the capacity
 * check and the RSVP membership; the gateway is not involved because an event
 * is a row and a reminder is an ordinary channel message. Scheduling future
 * reminders is a separate concern and is not pretended here.
 */
export const eventsModule = defineModule({
  id: "events",
  name: "Events",
  description: "Guild events with a lifecycle, capacity-checked RSVPs, reminders and export.",
  version: "0.1.0",
  settingsSchema: eventSettingsSchema,
  defaultSettings: eventDefaultSettings,
  commands: [event],
  intents: ["Guilds"],
  permissions: ["ManageGuild", "SendMessages", "EmbedLinks"],
  docsPath: "04-Modules/events/Spec.md",
});
