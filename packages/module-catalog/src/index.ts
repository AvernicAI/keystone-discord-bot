import type { ModuleManifest } from "@keystone/kernel";
import { diagnosticsModule } from "@keystone/module-diagnostics";
import { setupModule } from "@keystone/module-setup";
import { moderationModule } from "@keystone/module-moderation";
import { communityModule } from "@keystone/module-community";
import { aiModule } from "@keystone/module-ai";

/**
 * The one module list.
 *
 * The bot and the web dashboard must agree about which modules and settings
 * schemas exist. Keeping the list here means adding a module is one import and
 * one entry, never a second copy in `apps/web`.
 */
export const modules: readonly ModuleManifest[] = [
  diagnosticsModule,
  setupModule,
  moderationModule,
  communityModule,
  aiModule,
];
