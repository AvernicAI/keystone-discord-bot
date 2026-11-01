import { defineModule } from "@keystone/kernel";
import { logging } from "./commands/logging";
import { loggingDefaultSettings, loggingSettingsSchema } from "./settings";

/**
 * Audit logging.
 *
 * The gateway translation lives in `apps/bot/src/logging-events.ts`; the case
 * hook in the composition root feeds moderation cases into the same service.
 * This module owns policy, storage and rendering only.
 */
export const loggingModule = defineModule({
  id: "logging",
  name: "Audit logging",
  description: "One operator channel for message, member and moderation events, with retention.",
  version: "0.1.0",
  settingsSchema: loggingSettingsSchema,
  defaultSettings: loggingDefaultSettings,
  commands: [logging],
  intents: ["Guilds", "GuildMessages"],
  optionalIntents: ["GuildMembers", "MessageContent"],
  intentFallbacks: {
    GuildMembers:
      "member join and leave logs are disabled; message and moderation logs still work",
    MessageContent:
      "message delete and edit logs show IDs but not message content",
  },
  permissions: ["ManageGuild", "ViewChannel", "SendMessages", "EmbedLinks"],
  docsPath: "04-Modules/logging/Spec.md",
});
