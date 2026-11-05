import { defineModule } from "@keystone/kernel";
import { form } from "./commands/form";
import { formDefaultSettings, formSettingsSchema } from "./settings";

/**
 * Application forms.
 *
 * One root, eight subcommands. The module owns the store and the transitions.
 * A panel is an ordinary channel message whose signed Apply button opens a
 * modal for forms of five fields or fewer; the slash subcommand remains the
 * path for longer forms and scripting. Both call the same `FormService.submit`.
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
