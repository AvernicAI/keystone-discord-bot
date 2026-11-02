import { UserError } from "@keystone/kernel";
import type { ModerationPort, ModuleSettings, ReplyInput } from "@keystone/kernel";
import {
  completeVerification,
  moderationSettingsSchema,
} from "@keystone/module-moderation";

/**
 * The slice of a discord.js button this adapter needs. Keeping it structural
 * means the parsing and policy rules below are tested with plain objects, and
 * `index.ts` stays the only place that touches a gateway interaction.
 */
export interface ButtonInteractionLike {
  readonly customId: string;
  readonly guildId: string | null;
  readonly userId: string;
  reply(input: ReplyInput): Promise<unknown>;
}

export interface ModerationButtonDeps {
  /** Already scoped to the moderation module by the composition root. */
  readonly settings: ModuleSettings;
  readonly moderation: ModerationPort;
}

export type ModerationButtonRoute =
  | { readonly kind: "appeal"; readonly caseId: string }
  | {
      readonly kind: "verify";
      readonly guildId: string;
      readonly userId: string;
      /** True for the pre-pass-36 in-guild button, which carried no guild id. */
      readonly legacy: boolean;
    };

const APPEAL_PREFIX = "keystone:appeal:";
const VERIFY_PREFIX = "keystone:verify:";

/**
 * Turn a button custom id into a route, or `undefined` when this adapter does
 * not own it.
 *
 * Appeal ids are `keystone:appeal:<caseId>`. Verify ids are either the current
 * `keystone:verify:<guildId>:<userId>` (needed because a DM has no guild
 * context) or the legacy `keystone:verify:<userId>` form, which falls back to
 * the interaction's guild. Nothing else is valid: an empty segment, a missing
 * guild for the legacy form, or a third segment is rejected rather than
 * guessed at.
 */
export function parseModerationButtonId(
  customId: string,
  interactionGuildId: string | null,
): ModerationButtonRoute | undefined {
  if (customId.startsWith(APPEAL_PREFIX)) {
    const caseId = customId.slice(APPEAL_PREFIX.length);
    return caseId.length > 0 ? { kind: "appeal", caseId } : undefined;
  }

  if (!customId.startsWith(VERIFY_PREFIX)) return undefined;
  const rest = customId.slice(VERIFY_PREFIX.length);
  if (!rest) return undefined;

  const parts = rest.split(":");
  if (parts.length === 2) {
    const [guildId, userId] = parts;
    if (!guildId || !userId) return undefined;
    return { kind: "verify", guildId, userId, legacy: false };
  }

  if (parts.length === 1) {
    const [userId] = parts;
    if (!userId || !interactionGuildId) return undefined;
    return { kind: "verify", guildId: interactionGuildId, userId, legacy: true };
  }

  return undefined;
}

/**
 * Dispatch one moderation button. Returns false when the id belongs to another
 * feature, so the caller can leave it alone.
 */
export async function handleModerationButton(
  button: ButtonInteractionLike,
  deps: ModerationButtonDeps,
): Promise<boolean> {
  const route = parseModerationButtonId(button.customId, button.guildId);
  if (!route) return false;

  if (route.kind === "appeal") {
    await handleAppealButton(button, route.caseId, deps);
  } else {
    await handleVerifyButton(button, route, deps);
  }
  return true;
}

/**
 * The case button is member-facing: there is no staff permission to check.
 * Authorization is the case service's target-only rule, plus the operator's
 * `appealsEnabled` switch. The reply text is intentionally unchanged from the
 * inline version this replaced.
 */
export async function handleAppealButton(
  button: ButtonInteractionLike,
  caseId: string,
  deps: ModerationButtonDeps,
): Promise<void> {
  const guildId = button.guildId;
  if (!guildId) return;

  try {
    const settings = moderationSettingsSchema.parse(await deps.settings.get(guildId));
    if (!settings.appealsEnabled) {
      await button.reply({ content: "Appeals are disabled in this server.", ephemeral: true });
      return;
    }

    const record = await deps.moderation.cases.appealById(
      caseId,
      button.userId,
      "Appeal requested from the case button.",
    );
    await button.reply({
      content: `Appeal opened for case #${record.caseNumber}. A moderator can review it with /mod review.`,
      ephemeral: true,
    });
  } catch (error) {
    await button.reply({
      content: error instanceof UserError ? error.message : "Could not open that appeal.",
      ephemeral: true,
    });
  }
}

/**
 * The verify button is also member-facing, but the encoded user id is an
 * identity check, not a hint: a click from anyone else is refused before any
 * settings or store read. `completeVerification` owns the rest of the state
 * machine (gate, quarantine row, action order).
 */
export async function handleVerifyButton(
  button: ButtonInteractionLike,
  route: Extract<ModerationButtonRoute, { kind: "verify" }>,
  deps: ModerationButtonDeps,
): Promise<void> {
  // A DM has no guild, and Discord rejects ephemeral replies there. In a guild
  // the member's status stays private.
  const ephemeral = button.guildId !== null;

  if (button.userId !== route.userId) {
    await button.reply({
      content: "This verification belongs to another member.",
      ephemeral,
    });
    return;
  }

  try {
    const settings = moderationSettingsSchema.parse(await deps.settings.get(route.guildId));
    const outcome = await completeVerification({
      guildId: route.guildId,
      userId: route.userId,
      actorId: button.userId,
      settings,
      members: deps.moderation.members,
      actions: deps.moderation.actions,
    });
    await button.reply({ content: outcome.message, ephemeral });
  } catch (error) {
    await button.reply({
      content: error instanceof Error ? error.message : "Could not verify you.",
      ephemeral,
    });
  }
}
