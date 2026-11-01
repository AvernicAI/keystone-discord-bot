import { z } from "zod";
import { defineModule } from "@keystone/kernel";
import { setup } from "./commands/setup";

/**
 * Setup is deliberately read-only.
 *
 * A first-run wizard that writes configuration before the operator has seen
 * whether the database is reachable is how servers end up with half-applied
 * settings. This reports readiness, names the exact command to fix each gap,
 * and changes nothing.
 */
export const setupModule = defineModule({
  id: "setup",
  name: "Setup",
  description: "First-run readiness checks for the database, cache and modules.",
  version: "0.1.0",
  settingsSchema: z.object({
    enabled: z.boolean().default(true),
  }),
  defaultSettings: { enabled: true },
  intents: ["Guilds"],
  permissions: [],
  commands: [setup],
  docsPath: "04-Modules/setup/Spec.md",
});
