import { defineModule } from "@keystone/kernel";
import { invites } from "./commands/invites";
import { inviteDefaultSettings, inviteSettingsSchema } from "./settings";

/**
 * Invite tracking.
 *
 * One read-only root covers the whole domain. The gateway half lives in
 * `apps/bot/src/invite-events.ts`: invite caches and member joins are platform
 * details, while attribution, flags and totals are this module's job.
 */
export const invitesModule = defineModule({
  id: "invites",
  name: "Invites",
  description: "Invite attribution, leaderboard and advisory suspicious-join flags.",
  version: "0.1.0",
  settingsSchema: inviteSettingsSchema,
  defaultSettings: inviteDefaultSettings,
  commands: [invites],
  intents: ["Guilds", "GuildInvites"],
  optionalIntents: ["GuildMembers"],
  intentFallbacks: {
    GuildMembers:
      "invite attribution and leave retention are disabled; existing records stay readable",
  },
  permissions: ["ManageGuild"],
  docsPath: "04-Modules/invites/Spec.md",
});
