import { defineModule } from "@keystone/kernel";
import { rank } from "./commands/rank";
import { ticket } from "./commands/ticket";
import { tools } from "./commands/tools";
import { communityDefaultSettings, communitySettingsSchema } from "./settings";

/**
 * P3 community suite.
 *
 * Three roots cover the whole phase: `/rank` (XP and economy), `/ticket` and
 * `/tools` (community/content utilities). The phase adds 3 commands, taking the
 * bot to 9 of Discord's 100. Event-driven features (welcome, starboard, temp
 * voice, XP, ticket transcripts) are wired in the composition root.
 */
export const communityModule = defineModule({
  id: "community",
  name: "Community",
  description:
    "Leveling, economy, reaction roles, welcome, starboard, tickets, giveaways, temp voice and content tools.",
  version: "0.3.0",
  settingsSchema: communitySettingsSchema,
  defaultSettings: communityDefaultSettings,
  commands: [rank, ticket, tools],
  intents: [
    "GuildMembers",
    "GuildMessages",
    "MessageContent",
    "GuildMessageReactions",
    "GuildVoiceStates",
  ],
  permissions: [
    "ManageRoles",
    "ManageChannels",
    "ManageMessages",
    "AddReactions",
    "CreatePublicThreads",
    "ManageThreads",
    "Connect",
  ],
  docsPath: "04-Modules/community/Spec.md",
});
