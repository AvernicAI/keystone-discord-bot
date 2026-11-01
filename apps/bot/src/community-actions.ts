import {
  ChannelType,
  type Client,
  type Guild,
  type TextChannel,
  type ThreadChannel,
  type VoiceChannel,
} from "discord.js";
import type {
  CommunityActions,
  CommunityActionResult,
  CommunityMessage,
} from "@keystone/kernel";
import { toComponents } from "./adapt";

/**
 * The Discord side of the P3 community port. This file is deliberately dumb:
 * it translates an action into a discord.js call and returns a result. Policy,
 * cooldowns, balances and records live in `modules/community`.
 */
export function createDiscordCommunityActions(client: Client): CommunityActions {
  async function guild(guildId: string): Promise<Guild> {
    return client.guilds.fetch(guildId);
  }

  function failure(error: unknown): CommunityActionResult {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    async sendMessage(guildId, channelId, message) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !("send" in channel)) {
          return { ok: false, detail: "Channel cannot receive messages." };
        }
        const sent = await (channel as TextChannel).send(toPayload(message));
        return { ok: true, id: sent.id };
      } catch (error) {
        return failure(error);
      }
    },

    async editMessage(_guildId, channelId, messageId, message) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !("messages" in channel)) {
          return { ok: false, detail: "Channel cannot edit messages." };
        }
        const edited = await (channel as TextChannel).messages.fetch(messageId);
        await edited.edit(toPayload(message));
        return { ok: true, id: messageId };
      } catch (error) {
        return failure(error);
      }
    },

    async sendDM(userId, message) {
      try {
        const user = await client.users.fetch(userId);
        const sent = await user.send(toPayload(message));
        return { ok: true, id: sent.id };
      } catch (error) {
        return failure(error);
      }
    },

    async deleteMessage(_guildId, channelId, messageId) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !("messages" in channel)) {
          return { ok: false, detail: "Channel cannot delete messages." };
        }
        const message = await (channel as TextChannel).messages.fetch(messageId);
        await message.delete();
        return { ok: true, id: messageId };
      } catch (error) {
        return failure(error);
      }
    },

    async addRole(guildId, userId, roleId, reason) {
      try {
        const member = await (await guild(guildId)).members.fetch(userId);
        await member.roles.add(roleId, reason);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async removeRole(guildId, userId, roleId, reason) {
      try {
        const member = await (await guild(guildId)).members.fetch(userId);
        await member.roles.remove(roleId, reason);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async toggleRole(guildId, userId, roleId) {
      try {
        const member = await (await guild(guildId)).members.fetch(userId);
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId, "Reaction role");
          return { ok: true, added: true };
        }
        await member.roles.remove(roleId, "Reaction role");
        return { ok: true, added: false };
      } catch (error) {
        return failure(error);
      }
    },

    async hasRole(guildId, userId, roleId) {
      try {
        const member = await (await guild(guildId)).members.fetch(userId);
        return member.roles.cache.has(roleId);
      } catch {
        return false;
      }
    },

    async isBot(_guildId, userId) {
      try {
        return (await client.users.fetch(userId)).bot;
      } catch {
        return false;
      }
    },

    async createThread(guildId, channelId, name, message) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !("threads" in channel)) {
          return { ok: false, detail: "Channel does not support threads." };
        }
        const thread = await (channel as TextChannel).threads.create({
          name,
          type: ChannelType.PublicThread,
        });
        if (message) await thread.send(message);
        return { ok: true, id: thread.id };
      } catch (error) {
        return failure(error);
      }
    },

    async closeThread(_guildId, threadId, reason) {
      try {
        const thread = await client.channels.fetch(threadId);
        if (!thread || !thread.isThread()) return { ok: false, detail: "Not a thread." };
        await (thread as ThreadChannel).setArchived(true, reason);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async createVoiceChannel(guildId, name, options) {
      try {
        const channel = await (await guild(guildId)).channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: options?.parentId,
          userLimit: options?.userLimit,
        });
        return { ok: true, id: channel.id };
      } catch (error) {
        return failure(error);
      }
    },

    async deleteChannel(guildId, channelId, reason) {
      try {
        const channel = await (await guild(guildId)).channels.fetch(channelId);
        if (!channel) return { ok: false, detail: "Channel not found." };
        await channel.delete(reason);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async setChannelName(guildId, channelId, name) {
      try {
        const channel = await (await guild(guildId)).channels.fetch(channelId);
        if (!channel) return { ok: false, detail: "Channel not found." };
        await channel.setName(name);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async countMembers(guildId, channelId) {
      try {
        const channel = await (await guild(guildId)).channels.fetch(channelId);
        if (!channel) return 0;
        if (channel.isVoiceBased()) return (channel as VoiceChannel).members.size;
        if (channel.isThread()) return (channel as ThreadChannel).members.cache.size;
        return 0;
      } catch {
        return 0;
      }
    },
  };
}

function toPayload(message: CommunityMessage) {
  return {
    content: message.content,
    embeds: message.embeds,
    components: message.components ? toComponents(message.components) : undefined,
  } as never;
}
