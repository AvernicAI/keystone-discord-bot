import type {
  DashboardOverview,
  DashboardStore,
  ModuleRegistry,
  SettingsService,
} from "@keystone/kernel";
import type { DiscordGuild } from "./oauth";

export interface DashboardModule {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface DashboardView {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
  };
  joinedAt: string | null;
  counts: DashboardOverview["counts"];
  latestImport: DashboardOverview["latestImport"];
  modules: DashboardModule[];
}

/** Never ship a credential-shaped setting to a browser, even by accident. */
function safeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !/(token|secret|password|api[_-]?key)/i.test(key)),
  );
}

/**
 * Composes the existing `SettingsService` with the dashboard read model.
 * No SQL here: Postgres lives in `DrizzleDashboardStore`; HTTP lives in the
 * server. This class is the one place that shapes the read-only view.
 */
export class DashboardService {
  constructor(
    private readonly registry: ModuleRegistry,
    private readonly settings: SettingsService,
    private readonly store: DashboardStore,
  ) {}

  async view(guild: DiscordGuild): Promise<DashboardView> {
    const [overview, modules] = await Promise.all([
      this.store.overview(guild.id),
      Promise.all(
        this.registry.listModules().map(async (module) => {
          const values = safeSettings(await this.settings.get(guild.id, module.id));
          return {
            id: module.id,
            name: module.name,
            description: module.description,
            version: module.version,
            enabled: values.enabled !== false,
            settings: values,
          };
        }),
      ),
    ]);

    return {
      guild: { id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner },
      joinedAt: overview.joinedAt,
      counts: overview.counts,
      latestImport: overview.latestImport,
      modules,
    };
  }
}
