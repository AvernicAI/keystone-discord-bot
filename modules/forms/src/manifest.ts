import { defineModule } from "@keystone/kernel";
import { form } from "./commands/form";
import { formDefaultSettings, formSettingsSchema } from "./settings";

/**
 * Application forms.
 *
 * One root, eight subcommands. The module owns the store and the transitions;
 * the gateway is not involved because a panel is an ordinary channel message
 * and a submission is a slash subcommand. Modal input is a later UI-layer
 * concern, not a reason to pretend a form was submitted.
 */
export const formsModule = defineModule({
  id: "forms",
  name: "Forms",
  description: "Application forms with a published panel, a review queue and a checksummed export.",
  version: "0.1.0",
  settingsSchema: formSettingsSchema,
  defaultSettings: formDefaultSettings,
  commands: [form],
  intents: ["Guilds"],
  permissions: ["ManageGuild", "SendMessages", "EmbedLinks"],
  docsPath: "04-Modules/forms/Spec.md",
});
