import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  type Guild,
} from "discord.js";
import {
  NATIVE_AUTOMOD_PREFIX,
  type NativeAutoModRule,
} from "@keystone/module-moderation";

/**
 * Keep Discord's native AutoMod in step with our settings.
 *
 * Only rules named with our prefix are deleted; a server's own rules are
 * untouched. Native rules are a second layer, not the source of truth: our
 * scanner still records cases and appeals.
 */
export async function syncNativeAutoModRules(
  guild: Guild,
  plan: readonly NativeAutoModRule[],
): Promise<number> {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error("The bot needs ManageGuild to sync native AutoMod rules.");
  }

  const existing = await guild.autoModerationRules.fetch();
  for (const rule of existing.values()) {
    if (rule.name.startsWith(NATIVE_AUTOMOD_PREFIX)) {
      await rule.delete("Keystone is reconciling its managed AutoMod rules");
    }
  }

  for (const rule of plan) {
    await guild.autoModerationRules.create({
      name: rule.name,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType:
        rule.triggerType === "KEYWORD"
          ? AutoModerationRuleTriggerType.Keyword
          : AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: rule.triggerMetadata,
      actions: rule.actions.map((action) =>
        action.type === "BLOCK_MESSAGE"
          ? { type: AutoModerationActionType.BlockMessage }
          : {
              type: AutoModerationActionType.SendAlertMessage,
              metadata: { channel: action.metadata?.channelId ?? "" },
            },
      ),
      enabled: rule.enabled,
      reason: rule.reason,
    });
  }

  return plan.length;
}
