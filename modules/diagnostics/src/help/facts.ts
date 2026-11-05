import type {
  CommandCatalogEntry,
  CommunityPort,
  ConfigPort,
  HealthProbe,
  HealthReport,
  ModerationPort,
} from "@keystone/kernel";

/**
 * The help hub reads state that other modules already own: the live catalog,
 * the guild's module settings, the health probe and (when the caller may see
 * them) the moderation/ticket rows. Nothing here writes, and every optional
 * source is allowed to fail: a broken probe must not make `/help` useless.
 */
export const HELP_COUNT_LIMIT = 100;

export interface HelpModuleFacts {
  readonly id: string;
  /** The manifest name when settings are available, otherwise the id. */
  readonly name: string;
  /** `undefined` when this process has no settings port. */
  readonly enabled?: boolean;
  readonly roots: number;
  readonly subcommands: number;
}

export interface HelpCountFacts {
  readonly count: number;
  /** True when the store filled the query limit; the count is a lower bound. */
  readonly capped: boolean;
}

export interface HelpFacts {
  readonly modules: readonly HelpModuleFacts[];
  readonly modulesKnown: boolean;
  readonly modulesOn: number;
  readonly modulesTotal: number;
  readonly roots: number;
  readonly subcommands: number;
  readonly menus: number;
  readonly database: HealthReport["database"] | null;
  readonly cache: HealthReport["cache"] | null;
  readonly disabledFeatures: readonly string[];
  /** Absent when the community port is not wired or the read failed. */
  readonly tickets?: HelpCountFacts;
  /** Absent without the moderation port or ModerateMembers. */
  readonly cases?: HelpCountFacts;
}

export interface HelpFactsPorts {
  readonly guildId: string;
  /** The caller's guild permissions, used exactly as `/mod` is gated. */
  readonly permissions: readonly string[];
  readonly catalog: readonly CommandCatalogEntry[];
  readonly config?: Pick<ConfigPort, "list">;
  readonly health: HealthProbe;
  readonly moderation?: Pick<ModerationPort, "cases">;
  readonly community?: Pick<CommunityPort, "store">;
}

/** The same gate `/mod` uses; a help card must not widen it. */
export function canReviewCases(permissions: readonly string[]): boolean {
  return permissions.includes("ModerateMembers");
}

function chatInputOnly(
  catalog: readonly CommandCatalogEntry[],
): readonly CommandCatalogEntry[] {
  return catalog.filter((entry) => (entry.type ?? "chat-input") === "chat-input");
}

/**
 * Count rows while saying whether the answer is exact. A store that returns
 * exactly the limit cannot prove the total, so the panel prints `100+`.
 */
function counted<T>(rows: readonly T[] | undefined): HelpCountFacts | undefined {
  if (!rows) return undefined;
  return { count: rows.length, capped: rows.length >= HELP_COUNT_LIMIT };
}

export async function loadHelpFacts(ports: HelpFactsPorts): Promise<HelpFacts> {
  const entries = chatInputOnly(ports.catalog);

  // Settings give the display name and the on/off state. A settings failure is
  // not a command failure: fall back to ids and an unknown state.
  let views: Awaited<ReturnType<ConfigPort["list"]>> | undefined;
  if (ports.config) {
    try {
      views = await ports.config.list(ports.guildId);
    } catch {
      views = undefined;
    }
  }
  const viewById = new Map((views ?? []).map((view) => [view.id, view]));

  const groups = new Map<string, { roots: number; subcommands: number }>();
  for (const entry of entries) {
    const current = groups.get(entry.moduleId) ?? { roots: 0, subcommands: 0 };
    current.roots += 1;
    current.subcommands += entry.subcommands.length;
    groups.set(entry.moduleId, current);
  }

  const modules: HelpModuleFacts[] = [...groups].map(([id, counts]) => {
    const view = viewById.get(id);
    return {
      id,
      name: view?.name ?? id,
      ...(view ? { enabled: view.settings.enabled !== false } : {}),
      ...counts,
    };
  });
  const modulesKnown = views !== undefined;
  const modulesOn = modules.filter((module) => module.enabled === true).length;

  let report: HealthReport | undefined;
  try {
    report = await ports.health.probe();
  } catch {
    report = undefined;
  }

  let tickets: HelpCountFacts | undefined;
  if (ports.community) {
    try {
      const rows = await ports.community.store.listTickets(ports.guildId, {
        limit: HELP_COUNT_LIMIT,
      });
      tickets = counted(rows.filter((ticket) => ticket.state !== "closed"));
      // The list itself was capped, not only the open slice.
      if (tickets && rows.length >= HELP_COUNT_LIMIT) {
        tickets = { ...tickets, capped: true };
      }
    } catch {
      tickets = undefined;
    }
  }

  let cases: HelpCountFacts | undefined;
  if (ports.moderation && canReviewCases(ports.permissions)) {
    try {
      const [open, alerted] = await Promise.all([
        ports.moderation.cases.list(ports.guildId, {
          state: "open",
          limit: HELP_COUNT_LIMIT,
        }),
        ports.moderation.cases.list(ports.guildId, {
          state: "alerted",
          limit: HELP_COUNT_LIMIT,
        }),
      ]);
      cases = {
        count: open.length + alerted.length,
        capped:
          open.length >= HELP_COUNT_LIMIT || alerted.length >= HELP_COUNT_LIMIT,
      };
    } catch {
      cases = undefined;
    }
  }

  return {
    modules,
    modulesKnown,
    modulesOn,
    modulesTotal: modules.length,
    roots: entries.length,
    subcommands: entries.reduce((sum, entry) => sum + entry.subcommands.length, 0),
    menus: ports.catalog.length - entries.length,
    database: report?.database ?? null,
    cache: report?.cache ?? null,
    disabledFeatures: report?.capabilities?.disabledFeatures ?? [],
    ...(tickets ? { tickets } : {}),
    ...(cases ? { cases } : {}),
  };
}
