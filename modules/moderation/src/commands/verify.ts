import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
  type MemberStore,
  type MemberVerification,
} from "@keystone/kernel";
import { verifyButton } from "../cases";
import { moderationSettingsSchema } from "../settings";

function memberStore(ctx: CommandContext): MemberStore {
  if (!ctx.moderation?.members) {
    throw new UserError(
      "Verification state is not configured in this process. Run /setup to check the database.",
    );
  }
  return ctx.moderation.members;
}

function recordValue(record: MemberVerification | undefined, gateEnabled: boolean): string {
  if (!record) {
    return `No verification record.${gateEnabled ? "" : " The join gate is disabled here."}`;
  }
  if (record.verifiedAt) return `Verified at ${record.verifiedAt}.`;
  if (record.quarantined) return "Quarantined; verification is not complete.";
  return "Not verified; no quarantine is recorded.";
}

async function startVerification(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const settings = moderationSettingsSchema.parse(await ctx.settings.get(guildId));
  if (!settings.joinGate.enabled) {
    throw new UserError("The join gate is not enabled in this server.");
  }

  const members = memberStore(ctx);
  const existing = await members.get(guildId, ctx.userId);
  if (existing?.verifiedAt) {
    throw new UserError(`You are already verified (${existing.verifiedAt}).`);
  }
  if (existing && !existing.quarantined) {
    throw new UserError(
      "Your record does not show a quarantine. If you are still restricted, ask a moderator.",
    );
  }

  if (!ctx.community) {
    throw new UserError(
      "The DM verification path is not configured in this process. Ask a moderator for the in-server verify button.",
    );
  }

  const sent = await ctx.community.actions.sendDM(ctx.userId, {
    content:
      "Keystone verification: click the button below to leave quarantine in this server. If you did not request this, ignore it.",
    components: [verifyButton(guildId, ctx.userId)],
  });
  if (!sent.ok) {
    throw new UserError(
      `I could not DM you (${sent.detail ?? "DMs are closed"}). Open DMs from server members and run /verify start again.`,
    );
  }

  await ctx.interaction.reply({
    ephemeral: true,
    content:
      "Verification instructions sent to your DMs. Click the button there to complete verification; then run `/verify status` to check the persisted result.",
  });
}

async function verificationStatus(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const settings = moderationSettingsSchema.parse(await ctx.settings.get(guildId));
  const record = await memberStore(ctx).get(guildId, ctx.userId);
  const gateEnabled = settings.joinGate.enabled;
  const state = recordValue(record, gateEnabled);
  const next = record?.verifiedAt
    ? "Nothing to do; your verification is on record."
    : !gateEnabled
      ? "Ask a moderator to enable the join gate."
      : record && !record.quarantined
        ? "No quarantine is recorded. Ask a moderator if you are still restricted."
        : "Run `/verify start` to receive the verification button in a DM.";

  await ctx.interaction.reply({
    ephemeral: true,
    content: `Verification status · ${state}`,
    embeds: [
      {
        title: "Verification status",
        description: state,
        color: record?.verifiedAt ? 0x57f287 : 0xfee75c,
        fields: [
          { name: "Join gate", value: gateEnabled ? "enabled here" : "disabled here", inline: true },
          { name: "Quarantine record", value: record?.quarantined ? "quarantined" : "not quarantined", inline: true },
          { name: "Joined", value: record?.joinedAt ?? "no persisted join record", inline: true },
          { name: "Next step", value: next },
        ],
        footer: { text: "Read from the members table; gateway roles are not consulted." },
      },
    ],
  });
}

/**
 * `/verify` starts the join-gate flow and reports its persisted outcome.
 *
 * `start` only sends the existing verification button; the button is the one
 * completion path and writes `members.verified_at` after the quarantine action
 * succeeds. `status` reads that row, so a role change in Discord cannot make
 * the command claim a verification that never happened.
 */
export const verify = defineCommand({
  name: "verify",
  description: "Start the join gate or check your persisted verification status.",
  guards: [requireGuild, cooldown(5_000)],
  subcommands: [
    {
      name: "start",
      description: "Send yourself the verification button by DM.",
    },
    {
      name: "status",
      description: "Read your persisted verification and quarantine state.",
    },
  ],
  async execute(ctx) {
    const selected = ctx.commandPath[0];
    if (selected === "start") {
      await startVerification(ctx);
      return;
    }
    if (selected === "status") {
      await verificationStatus(ctx);
      return;
    }
    throw new UserError("Choose `/verify start` or `/verify status`.");
  },
  notes:
    "The DM button is the only completion path. `start` never marks a member verified; `status` reads the `members` row written after the quarantine action succeeds.",
});
