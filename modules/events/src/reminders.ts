import type { ComponentSigner, EventStore } from "@keystone/kernel";
import { buildEventPanel, type EventPanel } from "./panel";
import type { EventSettings } from "./settings";

/** The signer slice a panel needs; tests use a fixed-secret signer. */
export type EventPanelSigner = Pick<ComponentSigner, "sign">;

/** Where a channel-level reminder goes; Discord implements it in apps/bot. */
export interface EventPanelPoster {
  post(channelId: string, panel: EventPanel): Promise<void>;
}

export interface ReminderSweep {
  readonly sent: readonly string[];
  readonly failed: readonly string[];
  readonly skipped: number;
}

/**
 * The one automatic reminder, fired from the community tick.
 *
 * There is deliberately no event queue and no second `setInterval`: the tick
 * that already runs every minute for content, giveaways, birthdays and feeds
 * calls this sweep. The event row is the durable schedule — `starts_at`,
 * `reminder_lead_minutes` from settings and `reminded_at` — so a restart reruns
 * the same decision instead of losing an in-memory timer.
 *
 * `claimReminder` is the idempotency guard. Two overlapping ticks cannot both
 * post: the conditional update succeeds once. A failed post releases the claim
 * so the next tick retries instead of consuming the reminder silently.
 */
export class EventReminderService {
  constructor(
    private readonly store: EventStore,
    private readonly settings: EventSettings,
    private readonly signer: EventPanelSigner,
    private readonly poster: EventPanelPoster,
    private readonly now: () => number = Date.now,
  ) {}

  async sweep(guildId: string): Promise<ReminderSweep> {
    if (!this.settings.enabled) return { sent: [], failed: [], skipped: 0 };

    const now = this.now();
    const leadMs = this.settings.reminderLeadMinutes * 60_000;
    const sent: string[] = [];
    const failed: string[] = [];
    let skipped = 0;

    for (const event of await this.store.listEvents(guildId, 100)) {
      const startsAt = Date.parse(event.startsAt);
      const channelId = event.panelChannelId;
      const due =
        event.state === "open" &&
        event.remindedAt === undefined &&
        channelId !== undefined &&
        Number.isFinite(startsAt) &&
        startsAt > now &&
        startsAt - now <= leadMs;
      if (!due) {
        skipped += 1;
        continue;
      }

      const claimed = await this.store.claimReminder(guildId, event.id, new Date(now));
      if (!claimed) {
        // Another tick won the race, or the state changed between the read and
        // the claim. Either way this sweep must not post a second reminder.
        skipped += 1;
        continue;
      }

      const [going, notGoing] = await Promise.all([
        this.store.countRsvps(guildId, event.id, "going"),
        this.store.countRsvps(guildId, event.id, "not_going"),
      ]);
      const panel = buildEventPanel(
        claimed,
        { going, notGoing },
        this.signer,
        now,
        { heading: `Reminder ${claimed.reminderCount}` },
      );

      try {
        await this.poster.post(channelId, panel);
        sent.push(event.key);
      } catch {
        await this.store.releaseReminder(guildId, event.id);
        failed.push(event.key);
      }
    }

    return { sent, failed, skipped };
  }
}
