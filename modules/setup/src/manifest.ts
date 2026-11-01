import { z } from "zod";
import { defineModule } from "@keystone/kernel";
import { setup } from "./commands/setup";
import { config } from "./commands/config";

/**
 * Setup owns the operator's first questions: is this deployment ready, and what
 * is configured here? Both commands are read-through views of state that other
 * modules already own (`/setup` reads health, `/config` reads `SettingsService`).
 *
 * Writes go through `SettingsService.update`, so `/config set` is validated by
 * the target module's own Zod schema — the same schema the dashboard uses. A
 * second settings path would be a second source of truth; this module does not
 * add one.
 */
export const setupModule = defineModule({
  id: "setup",
  name: "Setup",
  description: "First-run readiness checks and per-guild module settings.",
  version: "0.2.0",
  settingsSchema: z.object({
    enabled: z.boolean().default(true),
  }),
  defaultSettings: { enabled: true },
  intents: ["Guilds"],
  permissions: [],
  commands: [setup, config],
  docsPath: "04-Modules/setup/Spec.md",
});
