import { defineModule } from "@keystone/kernel";
import { mod } from "./commands/mod";
import { appeal } from "./commands/appeal";
import { verify } from "./commands/verify";
import { reportMessage } from "./commands/report-message";
import { caseHistory } from "./commands/case-history";
import { moderationDefaultSettings, moderationSettingsSchema } from "./settings";

/**
 * Moderation and security share one case file.
 *
 * The manifest declares the intents and permissions the adapter needs. A
 * missing privileged intent is visible at boot rather than discovering halfway
 * through a raid that join events cannot be seen.
 */
export const moderationModule = defineModule({
  id: "moderation",
  name: "Moderation & security",
  description: "Cases, manual moderation, automod, anti-raid, anti-nuke, quarantine and appeals.",
  version: "0.2.0",
  settingsSchema: moderationSettingsSchema,
  defaultSettings: moderationDefaultSettings,
  commands: [mod, appeal, verify, reportMessage, caseHistory],
  intents: ["Guilds", "GuildMessages", "GuildModeration", "AutoModerationExecution"],
  optionalIntents: ["GuildMembers", "MessageContent"],
  intentFallbacks: {
    GuildMembers:
      "join-gate enforcement, quarantine-on-join and member join logging are disabled; manual /mod actions still work",
    MessageContent:
      "the message scanner is disabled; native AutoMod sync and context-menu reports still work",
  },
  permissions: [
    "ModerateMembers",
    "BanMembers",
    "KickMembers",
    "ManageMessages",
    "ManageChannels",
    "ManageRoles",
  ],
  docsPath: "04-Modules/moderation/Spec.md",
});
