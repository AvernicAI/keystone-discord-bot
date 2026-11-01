import { defineModule } from "@keystone/kernel";
import { ai } from "./commands/ai";
import { aiDefaultSettings, aiSettingsSchema } from "./settings";

/**
 * P4 AI layer.
 *
 * One root (`/ai`) reaches ask/docs/deflect/explain/summary/budget. The
 * mention-only chat is an event; ticket summary is also reachable from
 * `/ticket summary`. Every feature is opt-in and free.
 */
export const aiModule = defineModule({
  id: "ai",
  name: "AI",
  description: "Opt-in server RAG, ticket deflection, moderation explanations, summaries and hard cost caps.",
  version: "0.1.0",
  settingsSchema: aiSettingsSchema,
  defaultSettings: aiDefaultSettings,
  commands: [ai],
  intents: ["GuildMessages", "MessageContent"],
  docsPath: "04-Modules/ai/Spec.md",
});
