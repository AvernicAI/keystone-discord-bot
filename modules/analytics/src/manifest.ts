import { defineModule } from "@keystone/kernel";
import { analytics } from "./commands/analytics";
import { analyticsDefaultSettings, analyticsSettingsSchema } from "./settings";

/**
 * `/analytics` is a read model, not a collector.
 *
 * It owns one command root and one settings row. The numbers it prints come
 * from stores other modules already write (audit ledger, cases, invites,
 * tickets and command usage), so there is no analytics table to reconcile and
 * no second event pipeline to keep in sync.
 */
export const analyticsModule = defineModule({
  id: "analytics",
  name: "Analytics",
  description: "Read-only guild analytics over the bot's own records.",
  version: "0.1.0",
  settingsSchema: analyticsSettingsSchema,
  defaultSettings: analyticsDefaultSettings,
  commands: [analytics],
  intents: ["Guilds"],
  docsPath: "04-Modules/analytics",
});
