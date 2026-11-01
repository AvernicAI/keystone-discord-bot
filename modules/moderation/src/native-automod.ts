import type { ModerationSettings } from "./settings";

export type NativeAutoModRule = {
  name: string;
  eventType: "MESSAGE_SEND";
  triggerType: "KEYWORD" | "MENTION_SPAM";
  triggerMetadata: {
    keywordFilter?: string[];
    mentionTotalLimit?: number;
  };
  actions: {
    type: "BLOCK_MESSAGE" | "SEND_ALERT_MESSAGE";
    metadata?: { channelId: string };
  }[];
  enabled: boolean;
  reason: string;
};

const PREFIX = "Keystone";

/**
 * Discord's native AutoMod is a second enforcement layer, not a replacement
 * for our scanner. We manage only rules with our prefix, so a server's own
 * rules are never deleted by a sync.
 */
export function buildNativeAutoModPlan(settings: ModerationSettings): NativeAutoModRule[] {
  if (!settings.nativeAutoMod.sync) return [];

  const alert = settings.modLogChannelId
    ? ({
        type: "SEND_ALERT_MESSAGE" as const,
        metadata: { channelId: settings.modLogChannelId },
      })
    : undefined;
  const rules: NativeAutoModRule[] = [];

  if (settings.automod.invites !== "off") {
    rules.push({
      name: `${PREFIX} · invite links`,
      eventType: "MESSAGE_SEND",
      triggerType: "KEYWORD",
      triggerMetadata: {
        keywordFilter: ["discord.gg/", "discord.com/invite/", "discordapp.com/invite/"],
      },
      actions: [{ type: "BLOCK_MESSAGE" }, ...(alert ? [alert] : [])],
      enabled: true,
      reason: "Keystone manages this rule. Disable nativeAutoMod.sync to stop syncing.",
    });
  }

  if (settings.automod.maxMentions > 0) {
    rules.push({
      name: `${PREFIX} · mention limit`,
      eventType: "MESSAGE_SEND",
      triggerType: "MENTION_SPAM",
      triggerMetadata: { mentionTotalLimit: settings.automod.maxMentions },
      actions: [{ type: "BLOCK_MESSAGE" }, ...(alert ? [alert] : [])],
      enabled: true,
      reason: "Keystone manages this rule. Disable nativeAutoMod.sync to stop syncing.",
    });
  }

  return rules;
}

export const NATIVE_AUTOMOD_PREFIX = PREFIX;
