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
 * verify button. It reads persisted state first, performs the existing
 * quarantine action, then records the successful verification. It never
 * derives "already verified" from gateway roles.
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
  if (existing?.verifiedAt) {
    return { ok: false, message: `You are already verified (${existing.verifiedAt}).` };
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
