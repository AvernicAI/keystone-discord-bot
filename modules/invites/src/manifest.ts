import { defineModule } from "@keystone/kernel";
import { invites } from "./commands/invites";
import { inviteDefaultSettings, inviteSettingsSchema } from "./settings";

/**
 * Invite tracking.
 *
 * One read-only root covers the whole domain. The gateway half is split:
 * `apps/bot/src/invite-tracker.ts` owns the cache, join queue and decisions,
 * while `apps/bot/src/invite-events.ts` only translates discord.js events.
 * Attribution, flags and totals remain this module's job.
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
