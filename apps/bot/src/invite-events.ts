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
import { createInviteTracker } from "./invite-tracker";

/**
 * The gateway half of invite tracking.
 *
 * discord.js events carry Discord objects; the tracker owns the cache,
 * serialization and policy. This file should stay a translation layer: map the
 * event to a normalized input and let the tracker decide what it means.
 */
export function registerInviteEvents(
  client: Client,
  port: InvitePort,
  settings: ModuleSettings,
  logger: Logger,
): void {
  const tracker = createInviteTracker({ port, settings, logger });

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

  const onJoin = (member: GuildMember): void => {
    if (member.user.bot) return;
    void tracker.join({
      guildId: member.guild.id,
      userId: member.id,
      joinedAt: new Date(member.joinedTimestamp ?? Date.now()).toISOString(),
      accountAgeDays: Math.max(
        0,
        Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000),
      ),
      hasAvatar: member.user.avatar !== null,
      fetchInvites: () => fetchInvites(member.guild),
    });
  };

  const onLeave = (member: GuildMember | PartialGuildMember): void => {
    void tracker.leave(member.guild.id, member.id);
  };

  const onInviteCreate = (invite: Invite): void => {
    if (!invite.guild) return;
    tracker.addInvite(invite.guild.id, {
      code: invite.code,
      uses: invite.uses ?? 0,
      inviterId: invite.inviter?.id,
    });
  };

  const onInviteDelete = (invite: Invite): void => {
    if (!invite.guild) return;
    tracker.removeInvite(invite.guild.id, invite.code);
  };

  client.once(Events.ClientReady, (ready) => {
    for (const guild of ready.guilds.cache.values()) {
      void tracker.refresh(guild.id, () => fetchInvites(guild));
    }
  });
  client.on(Events.GuildCreate, (guild) => {
    void tracker.refresh(guild.id, () => fetchInvites(guild));
  });
  client.on(Events.InviteCreate, onInviteCreate);
  client.on(Events.InviteDelete, onInviteDelete);
  client.on(Events.GuildMemberAdd, onJoin);
  client.on(Events.GuildMemberRemove, onLeave);
}
