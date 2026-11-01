import {
  Events,
  type Client,
  type Guild,
  type GuildMember,
  type Invite,
  type PartialGuildMember,
} from "discord.js";
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
 * The gateway half of invite tracking.
 *
 * Discord does not say which invite a member used, only that some invite's
 * `uses` counter went up. So the adapter keeps the last known counter per guild
 * and diffs it after every join. Joins are serialized per guild: two members
 * arriving in the same second would otherwise both read the same "before"
 * snapshot and one attribution would be wrong.
 */
export function registerInviteEvents(
  client: Client,
  port: InvitePort,
  settings: ModuleSettings,
  logger: Logger,
): void {
  const caches = new Map<string, Map<string, InviteSource>>();
  const chains = new Map<string, Promise<unknown>>();
  const warned = new Set<string>();

  const fetchInvites = async (guild: Guild): Promise<Map<string, InviteSource>> => {
    const invites = await guild.invites.fetch();
    return new Map(
      [...invites.values()].map((invite) => [
        invite.code,
        {
          code: invite.code,
          uses: invite.uses ?? 0,
          inviterId: invite.inviter?.id,
        },
      ]),
    );
  };

  const warnOnce = (guildId: string, error: unknown): void => {
    if (warned.has(guildId)) return;
    warned.add(guildId);
    logger.warn("invite cache unavailable; joins will be recorded without an inviter", {
      guild: guildId,
      error: messageOf(error),
    });
  };

  const refresh = async (guild: Guild): Promise<void> => {
    try {
      caches.set(guild.id, await fetchInvites(guild));
      warned.delete(guild.id);
    } catch (error) {
      warnOnce(guild.id, error);
    }
  };

  const serial = <T>(guildId: string, task: () => Promise<T>): Promise<T> => {
    const previous = chains.get(guildId) ?? Promise.resolve();
    const next = previous.then(task, task);
    chains.set(guildId, next);
    return next;
  };

  const configFor = async (guildId: string) =>
    inviteSettingsSchema.parse(await settings.get(guildId));

  const onJoin = (member: GuildMember): void => {
    if (member.user.bot) return;
    void serial(member.guild.id, async () => {
      const config = await configFor(member.guild.id);
      if (!config.enabled) return;

      // No baseline means a cold cache. Never diff historical `uses` totals as
      // if they were increments from this join; record the join as unattributed
      // and seed the cache for the next one.
      const baseline = caches.get(member.guild.id);
      let after: Map<string, InviteSource> | undefined;
      try {
        after = await fetchInvites(member.guild);
        caches.set(member.guild.id, after);
      } catch (error) {
        warnOnce(member.guild.id, error);
      }

      const attribution =
        baseline && after
          ? attributeInvite([...baseline.values()], [...after.values()])
          : undefined;
      const joinedAt = new Date(member.joinedTimestamp ?? Date.now()).toISOString();
      const accountAgeDays = Math.max(
        0,
        Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000),
      );

      await new InviteService(port.store, port.actions, config).recordJoin(
        member.guild.id,
        {
          userId: member.id,
          joinedAt,
          accountAgeDays,
          hasAvatar: member.user.avatar !== null,
        },
        attribution,
      );
    }).catch((error: unknown) => {
      logger.warn("invite join handling failed", {
        guild: member.guild.id,
        error: messageOf(error),
      });
    });
  };

  const onLeave = (member: GuildMember | PartialGuildMember): void => {
    void serial(member.guild.id, async () => {
      const config = await configFor(member.guild.id);
      await new InviteService(port.store, port.actions, config).recordLeave(
        member.guild.id,
        member.id,
      );
    }).catch((error: unknown) => {
      logger.warn("invite leave handling failed", {
        guild: member.guild.id,
        error: messageOf(error),
      });
    });
  };

  const onInviteCreate = (invite: Invite): void => {
    if (!invite.guild) return;
    caches.get(invite.guild.id)?.set(invite.code, {
      code: invite.code,
      uses: invite.uses ?? 0,
      inviterId: invite.inviter?.id,
    });
  };

  const onInviteDelete = (invite: Invite): void => {
    if (!invite.guild) return;
    caches.get(invite.guild.id)?.delete(invite.code);
  };

  client.once(Events.ClientReady, (ready) => {
    for (const guild of ready.guilds.cache.values()) void refresh(guild);
  });
  client.on(Events.GuildCreate, (guild) => void refresh(guild));
  client.on(Events.InviteCreate, onInviteCreate);
  client.on(Events.InviteDelete, onInviteDelete);
  client.on(Events.GuildMemberAdd, onJoin);
  client.on(Events.GuildMemberRemove, onLeave);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
