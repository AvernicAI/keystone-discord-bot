import {
  UserError,
  type CommandCatalogEntry,
  type CommunityPort,
  type ComponentRouteContext,
  type ComponentRouter,
  type ComponentSigner,
  type ConfigPort,
  type HealthProbe,
  type ModerationPort,
  type V2Component,
} from "@keystone/kernel";
import { t } from "@keystone/i18n";
import {
  HELP_PANEL_TTL_MS,
  helpChangelogPanel,
  helpHomePanel,
  helpModulePanel,
  helpPrivacyPanel,
  loadHelpFacts,
  type HelpPanelActions,
} from "@keystone/module-diagnostics";

export { HELP_PANEL_TTL_MS };

/**
 * The help hub's component routes. They live in the bot app because only the
 * composition root has the signer; the module owns the copy and the trees, and
 * both the command and these handlers call the same facts loader.
 */
export interface HelpRouteDeps {
  readonly signer: ComponentSigner;
  readonly catalog: readonly CommandCatalogEntry[];
  readonly health: HealthProbe;
  readonly config?: ConfigPort;
  readonly moderation?: Pick<ModerationPort, "cases">;
  readonly community?: Pick<CommunityPort, "store">;
  /** Injected so expiry is deterministic in tests. */
  readonly now?: () => number;
}

function actions(deps: HelpRouteDeps): HelpPanelActions {
  const now = deps.now?.();
  const sign = (action: string): string =>
    deps.signer.sign({ namespace: "help", action, ttlMs: HELP_PANEL_TTL_MS }, now);
  return {
    browse: sign("browse"),
    home: sign("home"),
    privacy: sign("privacy"),
    changelog: sign("changelog"),
  };
}

async function update(
  context: ComponentRouteContext,
  v2: V2Component[],
): Promise<void> {
  if (!context.interaction.update) {
    throw new UserError(t(context.locale, "help.panel.noUpdate"));
  }
  await context.interaction.update({ v2 });
}

export function registerHelpRoutes(router: ComponentRouter, deps: HelpRouteDeps): void {
  const factsFor = (context: ComponentRouteContext) => {
    if (!context.guildId) {
      throw new UserError(t(context.locale, "component.guildOnly"));
    }
    return loadHelpFacts({
      guildId: context.guildId,
      permissions: context.interaction.permissions,
      catalog: deps.catalog,
      config: deps.config,
      health: deps.health,
      moderation: deps.moderation,
      community: deps.community,
    });
  };

  router.register({
    namespace: "help",
    action: "browse",
    kind: "select",
    guildOnly: true,
    async handle(context) {
      const moduleId = context.interaction.values?.[0];
      if (!moduleId) throw new UserError(t(context.locale, "help.unknown"));
      const entries = deps.catalog.filter(
        (entry) =>
          (entry.type ?? "chat-input") === "chat-input" && entry.moduleId === moduleId,
      );
      if (entries.length === 0) {
        throw new UserError(t(context.locale, "help.noModule", moduleId));
      }
      const facts = await factsFor(context);
      const module = facts.modules.find((candidate) => candidate.id === moduleId);
      if (!module) throw new UserError(t(context.locale, "help.noModule", moduleId));
      await update(
        context,
        helpModulePanel(
          module,
          entries,
          actions(deps),
          context.locale,
          facts.modules,
        ),
      );
    },
  });

  router.register({
    namespace: "help",
    action: "home",
    kind: "button",
    guildOnly: true,
    async handle(context) {
      const facts = await factsFor(context);
      await update(context, helpHomePanel(facts, actions(deps), context.locale));
    },
  });

  router.register({
    namespace: "help",
    action: "privacy",
    kind: "button",
    guildOnly: true,
    async handle(context) {
      await update(
        context,
        helpPrivacyPanel(actions(deps), context.locale),
      );
    },
  });

  router.register({
    namespace: "help",
    action: "changelog",
    kind: "button",
    guildOnly: true,
    async handle(context) {
      await update(
        context,
        helpChangelogPanel(actions(deps), context.locale),
      );
    },
  });
}
