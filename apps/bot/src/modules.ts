import type { ModuleManifest } from "@keystone/kernel";
import { diagnosticsModule } from "@keystone/module-diagnostics";
import { setupModule } from "@keystone/module-setup";
import { moderationModule } from "@keystone/module-moderation";
import { communityModule } from "@keystone/module-community";
import { aiModule } from "@keystone/module-ai";

/**
 * The one place modules are wired in.
 *
 * Adding a feature: create `modules/<feature>`, export its manifest, add it
 * here. There is no central command switch to edit, and no registry file that
 * every PR conflicts on.
 */
export const modules: readonly ModuleManifest[] = [
  diagnosticsModule,
  setupModule,
  moderationModule,
  communityModule,
  aiModule,
];
