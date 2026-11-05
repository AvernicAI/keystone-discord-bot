import { Events, type Client } from "discord.js";
import {
  ComponentRouter,
  type CommandCatalogEntry,
  type CommunityActions,
  type CommunityStore,
  type ComponentInteractionLike,
  type ComponentSigner,
  type ConfigPort,
  type EventStore,
  type FormStore,
  type HealthProbe,
  type Logger,
  type ModerationPort,
  type ModuleSettings,
} from "@keystone/kernel";
import { DEFAULT_LOCALE, guildLocale, t } from "@keystone/i18n";
import { asComponentInteraction } from "./adapt";
import { registerCommunityRoutes } from "./community-interactions";
import { registerEventRoutes } from "./event-interactions";
import { registerFormRoutes } from "./form-interactions";
import { registerHelpRoutes } from "./help-interactions";
import { registerModerationRoutes, type MemberTimelineLoader } from "./moderation-buttons";

export interface ComponentRuntimeDeps {
  /** Signs every button and modal id; only the composition root holds it. */
  readonly signer: ComponentSigner;
  readonly forms: FormStore;
  readonly formSettings: ModuleSettings;
  readonly moderation: {
    readonly settings: ModuleSettings;
    readonly moderation: ModerationPort;
  };
  /**
   * The read model behind the member timeline, built once by the composition
   * root so the panel's refresh button and `/mod history` read the same stores.
   */
  readonly timeline?: MemberTimelineLoader;
  /** Ticket panel writes and reads through the same community port as `/ticket`. */
  readonly community: {
    readonly store: CommunityStore;
    readonly actions: CommunityActions;
    readonly settings: ModuleSettings;
  };
  /** Event RSVP buttons call the same service `/event rsvp` uses. */
  readonly events: {
    readonly store: EventStore;
    readonly settings: ModuleSettings;
  };
  /** Reads the setup module's per-guild locale; absent means English. */
  readonly config?: ConfigPort;
  /** The live registry, so /help cannot advertise a command that is not there. */
  readonly catalog: readonly CommandCatalogEntry[];
  readonly health: HealthProbe;
  readonly logger: Logger;
  /** Injectable clock so id expiry and submission timestamps are deterministic. */
  readonly now?: () => number;
}

/**
 * Compose every signed component route. Each module's adapter file owns its own
 * routes next to the module's services; this function only wires the ports and
 * returns the one router the gateway listener dispatches through.
 */
export function createComponentRouter(deps: ComponentRuntimeDeps): ComponentRouter {
  const router = new ComponentRouter();

  registerFormRoutes(router, {
    forms: deps.forms,
    settings: deps.formSettings,
    signer: deps.signer,
    now: deps.now,
  });
  registerCommunityRoutes(router, {
    store: deps.community.store,
    actions: deps.community.actions,
    settings: deps.community.settings,
    signer: deps.signer,
    now: deps.now,
  });
  registerEventRoutes(router, {
    store: deps.events.store,
    settings: deps.events.settings,
  });
  // The verify id carries its guild inside the signed payload, because a DM has
  // none; the route itself lives beside moderation's button handlers.
  registerModerationRoutes(router, {
    ...deps.moderation,
    signer: deps.signer,
    timeline: deps.timeline,
  });
  // The help hub reads the catalog and health the bot already has, rather than
  // a second copy of either. Its routes are guild-only and signed like every
  // other panel.
  registerHelpRoutes(router, {
    signer: deps.signer,
    catalog: deps.catalog,
    health: deps.health,
    config: deps.config,
    moderation: deps.moderation.moderation,
    community: deps.community,
    now: deps.now,
  });

  return router;
}

/**
 * One gateway listener for every component kind. Every id is signed and
 * handled by the router, which checks the signature, the expiry, the guild and
 * the route's permission before a handler runs. An id without the signed
 * prefix belongs to no route and is left unhandled.
 */
export function registerComponentInteractions(client: Client, deps: ComponentRuntimeDeps): void {
  const router = createComponentRouter(deps);

  client.on(Events.InteractionCreate, (interaction) => {
    if (
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isModalSubmit()
    ) {
      return;
    }
    const like: ComponentInteractionLike = asComponentInteraction(interaction);

    void (async () => {
      const locale = like.guildId
        ? await guildLocale(deps.config, like.guildId)
        : DEFAULT_LOCALE;
      await router.dispatch(like, deps.signer, deps.now?.() ?? Date.now(), {
        locale,
        messages: {
          expired: t(locale, "component.expired"),
          noPermission: t(locale, "component.noPermission"),
          guildOnly: t(locale, "component.guildOnly"),
          wrongGuild: t(locale, "component.wrongGuild"),
        },
      });
    })().catch((error: unknown) => {
      deps.logger.error("component interaction failed", {
        kind: like.kind,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
    });
  });
}
