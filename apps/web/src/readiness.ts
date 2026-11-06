/**
 * The setup checklist is computed, never decorative.
 *
 * Each item maps to a fact the dashboard can read: at least one module enabled,
 * a logging destination, a welcome destination, and a portability receipt. If
 * a check cannot be computed, it is not shown as a tick.
 */
export interface ReadinessInput {
  readonly guildId: string;
  readonly modulesEnabled: number;
  readonly modulesTotal: number;
  readonly loggingReady: boolean;
  readonly welcomeReady: boolean;
  readonly hasImport: boolean;
}

export interface ReadinessItem {
  readonly id: "modules" | "logging" | "welcome" | "import";
  readonly label: string;
  readonly detail: string;
  readonly done: boolean;
  readonly href: string;
  readonly action: string;
}

export interface Readiness {
  readonly items: readonly ReadinessItem[];
  readonly done: number;
  readonly total: number;
  readonly ready: boolean;
}

export function buildReadiness(input: ReadinessInput): Readiness {
  const base = `/dashboard/guilds/${encodeURIComponent(input.guildId)}`;
  const items: ReadinessItem[] = [
    {
      id: "modules",
      label: "Turn on at least one module",
      detail:
        input.modulesEnabled === 0
          ? "Every module is off. Nothing will answer a command or record an event."
          : `${input.modulesEnabled} of ${input.modulesTotal} modules are on.`,
      done: input.modulesEnabled > 0,
      href: `${base}#modules`,
      action: "Open modules",
    },
    {
      id: "logging",
      label: "Send the event ledger somewhere",
      detail: input.loggingReady
        ? "A logging channel is set; deletes, edits and joins can be retained."
        : "No logging channel is set, so the event ledger stays empty and analytics has nothing to count.",
      done: input.loggingReady,
      href: `${base}/settings/logging`,
      action: "Set a channel",
    },
    {
      id: "welcome",
      label: "Welcome new members",
      detail: input.welcomeReady
        ? "Welcome is on with a destination channel."
        : "Welcome is off or has no channel. New members arrive with no greeting.",
      done: input.welcomeReady,
      href: `${base}/settings/community`,
      action: "Configure",
    },
    {
      id: "import",
      label: "Take a portability receipt",
      detail: input.hasImport
        ? "This server has an import or backup receipt, so its settings can be reproduced."
        : "No import or backup receipt yet. Export a config bundle before a large change.",
      done: input.hasImport,
      href: `${base}/config/drift`,
      action: "Export or import",
    },
  ];
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, ready: done === items.length };
}
