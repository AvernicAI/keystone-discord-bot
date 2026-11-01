import type {
  ActionRow,
  CommunityActions,
  CommunityActionResult,
  CommunityMessage,
} from "@keystone/kernel";

export interface SentMessage {
  guildId: string;
  channelId: string;
  message: CommunityMessage;
  id: string;
}

/** Deterministic action recorder for module and command tests. */
export class RecordingCommunityActions implements CommunityActions {
  readonly sent: SentMessage[] = [];
  readonly edited: { channelId: string; messageId: string; message: CommunityMessage }[] = [];
  readonly dms: { userId: string; message: CommunityMessage }[] = [];
  readonly roleCalls: { userId: string; roleId: string; added: boolean }[] = [];
  readonly threads: { channelId: string; name: string }[] = [];
  readonly closedThreads: string[] = [];
  readonly voiceCreated: { name: string }[] = [];
  readonly channelsDeleted: string[] = [];
  readonly channelNames: { channelId: string; name: string }[] = [];
  readonly deletedMessages: { channelId: string; messageId: string }[] = [];
  readonly botIds = new Set<string>();
  readonly holders = new Map<string, Set<string>>();
  memberCount = 0;
  #next = 1;

  reset(): void {
    this.sent.length = 0;
    this.edited.length = 0;
    this.dms.length = 0;
    this.roleCalls.length = 0;
    this.threads.length = 0;
    this.closedThreads.length = 0;
    this.voiceCreated.length = 0;
    this.channelsDeleted.length = 0;
    this.channelNames.length = 0;
    this.deletedMessages.length = 0;
    this.botIds.clear();
    this.holders.clear();
    this.memberCount = 0;
    this.#next = 1;
  }

  async sendMessage(
    guildId: string,
    channelId: string,
    message: CommunityMessage,
  ): Promise<CommunityActionResult> {
    const id = `msg-${this.#next++}`;
    this.sent.push({ guildId, channelId, message, id });
    return { ok: true, id };
  }

  async editMessage(
    _guildId: string,
    channelId: string,
    messageId: string,
    message: CommunityMessage,
  ): Promise<CommunityActionResult> {
    this.edited.push({ channelId, messageId, message });
    return { ok: true, id: messageId };
  }

  async sendDM(userId: string, message: CommunityMessage): Promise<CommunityActionResult> {
    this.dms.push({ userId, message });
    return { ok: true, id: `dm-${this.#next++}` };
  }

  async deleteMessage(
    _guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<CommunityActionResult> {
    this.deletedMessages.push({ channelId, messageId });
    return { ok: true, id: messageId };
  }

  async addRole(
    _guildId: string,
    userId: string,
    roleId: string,
  ): Promise<CommunityActionResult> {
    this.roleCalls.push({ userId, roleId, added: true });
    const key = `${userId}:${roleId}`;
    this.holders.set(key, new Set([roleId]));
    return { ok: true };
  }

  async removeRole(
    _guildId: string,
    userId: string,
    roleId: string,
  ): Promise<CommunityActionResult> {
    this.roleCalls.push({ userId, roleId, added: false });
    this.holders.delete(`${userId}:${roleId}`);
    return { ok: true };
  }

  async toggleRole(
    _guildId: string,
    userId: string,
    roleId: string,
  ): Promise<CommunityActionResult & { added?: boolean }> {
    const key = `${userId}:${roleId}`;
    const has = this.holders.has(key);
    if (has) {
      this.holders.delete(key);
      this.roleCalls.push({ userId, roleId, added: false });
      return { ok: true, added: false };
    }
    this.holders.set(key, new Set([roleId]));
    this.roleCalls.push({ userId, roleId, added: true });
    return { ok: true, added: true };
  }

  async hasRole(_guildId: string, userId: string, roleId: string): Promise<boolean> {
    return this.holders.has(`${userId}:${roleId}`);
  }

  async isBot(_guildId: string, userId: string): Promise<boolean> {
    return this.botIds.has(userId);
  }

  async createThread(
    _guildId: string,
    channelId: string,
    name: string,
  ): Promise<CommunityActionResult> {
    const id = `thread-${this.#next++}`;
    this.threads.push({ channelId, name });
    return { ok: true, id };
  }

  async closeThread(_guildId: string, threadId: string): Promise<CommunityActionResult> {
    this.closedThreads.push(threadId);
    return { ok: true };
  }

  async createVoiceChannel(
    _guildId: string,
    name: string,
  ): Promise<CommunityActionResult> {
    const id = `voice-${this.#next++}`;
    this.voiceCreated.push({ name });
    return { ok: true, id };
  }

  async deleteChannel(_guildId: string, channelId: string): Promise<CommunityActionResult> {
    this.channelsDeleted.push(channelId);
    return { ok: true };
  }

  async setChannelName(
    _guildId: string,
    channelId: string,
    name: string,
  ): Promise<CommunityActionResult> {
    this.channelNames.push({ channelId, name });
    return { ok: true };
  }

  async countMembers(): Promise<number> {
    return this.memberCount;
  }
}

/** Convenience accessor used by tests that assert component rows. */
export function firstRow(message: CommunityMessage): ActionRow | undefined {
  return message.components?.[0];
}
