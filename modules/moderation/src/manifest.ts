import { defineModule } from "@keystone/kernel";
import { mod } from "./commands/mod";
import { appeal } from "./commands/appeal";
import { verify } from "./commands/verify";
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
  commands: [mod, appeal, verify],
  intents: [
    "GuildMembers",
    "GuildMessages",
    "MessageContent",
    "GuildModeration",
    "AutoModerationExecution",
  ],
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
