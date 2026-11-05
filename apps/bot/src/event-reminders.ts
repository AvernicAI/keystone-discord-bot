import type { Client, TextChannel } from "discord.js";
import type {
  ComponentSigner,
  EventStore,
  Logger,
  ModuleSettings,
} from "@keystone/kernel";
import {
  EventReminderService,
  eventSettingsSchema,
  type EventPanel,
  type EventPanelPoster,
  type ReminderSweep,
} from "@keystone/module-events";
import { toReplyOptions } from "./adapt";
import { resolveChannel } from "./channels";

/** Discord's side of the event panel: resolve the recorded channel and post. */
export function createDiscordEventPoster(client: Client): EventPanelPoster {
  return {
    async post(channelId: string, panel: EventPanel): Promise<void> {
      const resolved = await resolveChannel(
        () => client.channels.fetch(channelId),
        channelId,
      );
      if (resolved.status !== "ok") throw new Error(resolved.reason);
      const channel = resolved.channel;
      if (!channel.isTextBased() || !("send" in channel)) {
        throw new Error(`channel ${channelId} cannot receive messages`);
      }
      await (channel as TextChannel).send(toReplyOptions(panel.reply) as never);
    },
  };
}

export interface EventReminderDeps {
  readonly store: EventStore;
  readonly settings: ModuleSettings;
  readonly signer: Pick<ComponentSigner, "sign">;
  readonly poster: EventPanelPoster;
}

/**
 * One guild's automatic reminder pass. Called from the existing 60-second
 * community tick in `community-events.ts`; this file does not start a timer.
 *
 * Settings parsing and the sweep are separated so a malformed settings row is
 * logged against this feature instead of looking like an unrelated tick crash.
 */
export async function sweepEventReminders(
  deps: EventReminderDeps,
  logger: Logger,
  guildId: string,
  now: number = Date.now(),
): Promise<ReminderSweep> {
  const settings = eventSettingsSchema.parse(await deps.settings.get(guildId));
  const sweep = await new EventReminderService(
    deps.store,
    settings,
    deps.signer,
    deps.poster,
    () => now,
  ).sweep(guildId);

  if (sweep.sent.length > 0 || sweep.failed.length > 0) {
    logger.info("event reminders swept", {
      guild: guildId,
      sent: sweep.sent,
      failed: sweep.failed,
    });
  }
  return sweep;
}
