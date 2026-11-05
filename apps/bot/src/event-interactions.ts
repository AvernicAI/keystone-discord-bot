import {
  type ComponentRouter,
  type EventStore,
  type ModuleSettings,
} from "@keystone/kernel";
import { EventService, eventSettingsSchema } from "@keystone/module-events";

/** The event store and settings the signed RSVP buttons read. */
export interface EventRouteDeps {
  readonly store: EventStore;
  readonly settings: ModuleSettings;
}

/**
 * The event module's signed component routes.
 *
 * The panel mints two ids, `event:going:<event id>` and
 * `event:not_going:<event id>`. Both handlers take the member id from the
 * interaction and call `EventService.rsvp`, the same service `/event rsvp`
 * uses. That is what keeps a button from becoming a second write path: capacity,
 * the open-state gate and RSVP ownership are decided once, in the module.
 */
export function registerEventRoutes(
  router: ComponentRouter,
  deps: EventRouteDeps,
): ComponentRouter {
  for (const answer of ["going", "not_going"] as const) {
    router.register({
      namespace: "event",
      action: answer,
      kind: "button",
      guildOnly: true,
      async handle({ interaction, payload, now: current }) {
        if (!interaction.guildId) return;
        const settings = eventSettingsSchema.parse(
          await deps.settings.get(interaction.guildId),
        );
        const outcome = await new EventService(
          deps.store,
          settings,
          () => current,
        ).rsvp(interaction.guildId, interaction.userId, payload, answer);

        const capped =
          outcome.event.capacity === undefined
            ? `${outcome.going} going`
            : `${outcome.going}/${outcome.event.capacity} going`;
        await interaction.reply({
          content: `RSVP for \`${outcome.event.key}\` recorded · ${
            answer === "going" ? "going" : "not going"
          } · ${capped}.`,
          ephemeral: true,
        });
      },
    });
  }

  return router;
}
