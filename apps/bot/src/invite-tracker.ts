import type {
  InvitePort,
  InviteSource,
  Logger,
  ModuleSettings,
} from "@keystone/kernel";
import {
  InviteService,
  attributeInvite,
  inviteSettingsSchema,
} from "@keystone/module-invites";

/**
 * The gateway-independent half of invite tracking.
 *
 * Discord does not say which invite a member used, only that some invite's
 * `uses` counter went up. This tracker owns the last known counter per guild
 * and the per-guild queue that makes two simultaneous joins safe. It knows
 * nothing about discord.js: the gateway adapter supplies the fetch closure and
 * the already-normalized join profile.
 *
 * Keeping this state here, rather than in a closure beside event handlers,
 * gives the cache and its serialization one owner that can be tested without a
 * gateway.
 */

export type InviteFetch = () => Promise<Map<string, InviteSource>>;

export interface InviteJoinEvent {
  readonly guildId: string;
  readonly userId: string;
  readonly joinedAt: string;
  readonly accountAgeDays: number;
  readonly hasAvatar: boolean;
  readonly fetchInvites: InviteFetch;
}

export interface InviteTracker {
  refresh(guildId: string, fetchInvites: InviteFetch): Promise<void>;
  join(event: InviteJoinEvent): Promise<void>;
  leave(guildId: string, userId: string): Promise<void>;
  addInvite(guildId: string, invite: InviteSource): void;
  removeInvite(guildId: string, code: string): void;
}

export interface InviteTrackerDeps {
  readonly port: InvitePort;
  readonly settings: ModuleSettings;
  readonly logger: Logger;
}

export function createInviteTracker(deps: InviteTrackerDeps): InviteTracker {
  const { port, settings, logger } = deps;
  const caches = new Map<string, Map<string, InviteSource>>();
  const chains = new Map<string, Promise<unknown>>();
  const warned = new Set<string>();

  const warnOnce = (guildId: string, error: unknown): void => {
    if (warned.has(guildId)) return;
    warned.add(guildId);
    logger.warn("invite cache unavailable; joins will be recorded without an inviter", {
      guild: guildId,
      error: messageOf(error),
    });
  };

  const serial = <T>(guildId: string, task: () => Promise<T>): Promise<T> => {
    const previous = chains.get(guildId) ?? Promise.resolve();
    const next = previous.then(task, task);
    chains.set(guildId, next);
    return next;
  };

  const configFor = async (guildId: string) =>
    inviteSettingsSchema.parse(await settings.get(guildId));

  const refresh = async (guildId: string, fetchInvites: InviteFetch): Promise<void> => {
    try {
      caches.set(guildId, await fetchInvites());
      warned.delete(guildId);
    } catch (error) {
      warnOnce(guildId, error);
    }
  };

  const join = async (event: InviteJoinEvent): Promise<void> => {
    try {
      await serial(event.guildId, async () => {
        const config = await configFor(event.guildId);
        if (!config.enabled) return;

        // No baseline means a cold cache. Never diff historical `uses` totals
        // as if they were increments from this join; record the join as
        // unattributed and seed the cache for the next one.
        const baseline = caches.get(event.guildId);
        let after: Map<string, InviteSource> | undefined;
        try {
          after = await event.fetchInvites();
          caches.set(event.guildId, after);
        } catch (error) {
          warnOnce(event.guildId, error);
        }

        const attribution =
          baseline && after
            ? attributeInvite([...baseline.values()], [...after.values()])
            : undefined;

        await new InviteService(port.store, port.actions, config).recordJoin(
          event.guildId,
          {
            userId: event.userId,
            joinedAt: event.joinedAt,
            accountAgeDays: event.accountAgeDays,
            hasAvatar: event.hasAvatar,
          },
          attribution,
        );
      });
    } catch (error) {
      logger.warn("invite join handling failed", {
        guild: event.guildId,
        error: messageOf(error),
      });
    }
  };

  const leave = async (guildId: string, userId: string): Promise<void> => {
    try {
      await serial(guildId, async () => {
        const config = await configFor(guildId);
        await new InviteService(port.store, port.actions, config).recordLeave(
          guildId,
          userId,
        );
      });
    } catch (error) {
      logger.warn("invite leave handling failed", {
        guild: guildId,
        error: messageOf(error),
      });
    }
  };

  return {
    refresh,
    join,
    leave,
    addInvite(guildId, invite) {
      caches.get(guildId)?.set(invite.code, invite);
    },
    removeInvite(guildId, code) {
      caches.get(guildId)?.delete(code);
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
