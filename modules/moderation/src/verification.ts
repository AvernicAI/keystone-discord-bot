import type { MemberStore, ModerationActions } from "@keystone/kernel";
import type { ModerationSettings } from "./settings";

export interface VerificationOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly verifiedAt?: string;
}

export interface VerificationDeps {
  readonly guildId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly settings: ModerationSettings;
  readonly members: MemberStore;
  readonly actions: Pick<ModerationActions, "unquarantine">;
  readonly now?: () => number;
}

/**
 * The one completion path shared by the DM button and the legacy in-guild
 * verify button. It transitions only a persisted quarantined row: no record
 * and a non-quarantined record are refusals, not implicit verifications. It
 * performs the existing quarantine action before recording the completion, so
 * a failed action cannot create a verified row.
 */
export async function completeVerification(
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  if (deps.actorId !== deps.userId) {
    return { ok: false, message: "This verification belongs to another member." };
  }
  if (!deps.settings.joinGate.enabled) {
    return { ok: false, message: "The join gate is not enabled in this server." };
  }

  const existing = await deps.members.get(deps.guildId, deps.userId);
  if (!existing) {
    return {
      ok: false,
      message: "No quarantine is recorded for you in this server. If you are restricted, ask a moderator.",
    };
  }
  if (existing.verifiedAt) {
    return { ok: false, message: `You are already verified (${existing.verifiedAt}).` };
  }
  if (!existing.quarantined) {
    return {
      ok: false,
      message: "No quarantine is recorded for you in this server. If you are restricted, ask a moderator.",
    };
  }

  const result = await deps.actions.unquarantine(
    deps.guildId,
    deps.userId,
    "Verification completed",
    deps.settings.quarantineRoleId,
  );
  if (!result.ok) {
    return {
      ok: false,
      message: `Could not verify you: ${result.detail ?? "check that the bot can manage the quarantine role"}`,
    };
  }

  const verifiedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const record = await deps.members.markVerified(deps.guildId, deps.userId, verifiedAt);
  return {
    ok: true,
    message: "Verified. Quarantine has been lifted.",
    verifiedAt: record.verifiedAt,
  };
}
