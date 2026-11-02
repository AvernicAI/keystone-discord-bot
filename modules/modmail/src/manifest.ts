import { defineModule } from "@keystone/kernel";
import { modmail } from "./commands/modmail";
import { modmailDefaultSettings, modmailSettingsSchema } from "./settings";

/**
 * Private member-to-staff mail.
 *
 * One root, six subcommands. The module owns the privacy rule, the open →
 * claimed → closed lifecycle and the transcript archive; the gateway is not
 * involved because the conversation is read through commands, not a thread the
 * bot has to keep in sync.
 */
export const modmailModule = defineModule({
  id: "modmail",
  name: "Modmail",
  description: "Private member-to-staff mail with owner-or-staff visibility and archived transcripts.",
  version: "0.1.0",
  settingsSchema: modmailSettingsSchema,
  defaultSettings: modmailDefaultSettings,
  commands: [modmail],
  intents: ["Guilds"],
  permissions: ["ManageGuild", "ManageMessages", "SendMessages", "EmbedLinks"],
  docsPath: "04-Modules/modmail/Spec.md",
});
