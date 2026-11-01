import type { InviteActions, InviteNotice } from "@keystone/kernel";

/** Records the one notification the invite module can send. */
export class RecordingInviteActions implements InviteActions {
  readonly notices: { guildId: string; channelId: string; notice: InviteNotice }[] = [];

  async notify(guildId: string, channelId: string, notice: InviteNotice): Promise<void> {
    this.notices.push({ guildId, channelId, notice });
  }
}
