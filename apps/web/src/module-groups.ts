/**
 * Grouping is presentation, not a module-contract change.
 *
 * The registry stays the one source of truth for what exists; this file only
 * decides where a module sits in the dashboard. A registry test fails if a new
 * module is not placed exactly once, so a module can never silently disappear
 * from the catalog.
 */
export interface ModuleGroupDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly modules: readonly string[];
}

export const MODULE_GROUPS: readonly ModuleGroupDefinition[] = [
  {
    id: "safety",
    title: "Safety",
    description: "Enforcement, evidence and the event ledger.",
    modules: ["moderation", "logging"],
  },
  {
    id: "community",
    title: "Community",
    description: "The things members use every day.",
    modules: ["community", "invites", "events", "forms", "music"],
  },
  {
    id: "support",
    title: "Support",
    description: "Answer members without losing the thread.",
    modules: ["modmail", "ai"],
  },
  {
    id: "operations",
    title: "Operations",
    description: "The state of the server and of Keystone itself.",
    modules: ["setup", "analytics", "diagnostics"],
  },
];

export interface ModuleGroupView<T extends { readonly id: string }> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly modules: readonly T[];
}

/**
 * Place every registered module once. An unplaced module is appended to a last
 * group instead of being dropped; `audit:visuals` and the unit test make that
 * visible rather than relying on this fallback forever.
 *
 * Generic so the overview can group its browser-safe view without pretending
 * it holds live manifests.
 */
export function groupModules<T extends { readonly id: string }>(
  modules: readonly T[],
): ModuleGroupView<T>[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const placed = new Set<string>();
  const groups: ModuleGroupView<T>[] = MODULE_GROUPS.map((group) => {
    const entries: T[] = [];
    for (const id of group.modules) {
      const module = byId.get(id);
      if (!module || placed.has(id)) continue;
      placed.add(id);
      entries.push(module);
    }
    return { id: group.id, title: group.title, description: group.description, modules: entries };
  });

  const unplaced = modules.filter((module) => !placed.has(module.id));
  if (unplaced.length > 0) {
    groups.push({
      id: "other",
      title: "Other",
      description: "Registered modules that are not in a group yet.",
      modules: unplaced,
    });
  }
  return groups.filter((group) => group.modules.length > 0);
}
