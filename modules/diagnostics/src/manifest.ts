import { z } from "zod";
import { defineModule } from "@keystone/kernel";
import { about } from "./commands/about";
import { ping } from "./commands/ping";

/**
 * Reference module.
 *
 * It is intentionally small, but it exercises every part of the contract:
 * a settings schema with defaults, two commands, a guard, and tests that need
 * no token. Copy this folder when you build a new feature.
 */
export const diagnosticsModule = defineModule({
  id: "diagnostics",
  name: "Diagnostics",
  description: "Health, version and configuration checks.",
  version: "0.1.0",
  settingsSchema: z.object({
    enabled: z.boolean().default(true),
    detailed: z.boolean().default(false),
  }),
  defaultSettings: { enabled: true, detailed: false },
  intents: ["Guilds"],
  permissions: [],
  commands: [ping, about],
  docsPath: "04-Modules/diagnostics/Spec.md",
});
