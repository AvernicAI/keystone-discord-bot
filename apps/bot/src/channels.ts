import { DiscordAPIError } from "discord.js";

/**
 * Discord's channel-obfuscation rollout (announced for 2026-11-16) hides
 * channels the bot cannot view. Gateway payloads keep the id, type, position
 * and parent, but the name becomes `___hidden___` and the
 * `CHANNEL_OBFUSCATED` flag (1 << 17) is set. HTTP may omit the channel
 * entirely. Anything that matched a channel by name, or assumed the guild's
 * channel cache was complete, breaks silently.
 *
 * This module is the single seam for that behavior. Call sites fetch by id and
 * switch on a typed result; no policy lives here.
 */

const OBFUSCATED_FLAG = 1 << 17;
const HIDDEN_NAME = "___hidden___";

/** The smallest channel shape the resolver needs. discord.js channels satisfy it. */
export interface ChannelLike {
  readonly id: string;
  readonly name?: string | null;
  readonly flags?: { readonly bitfield: number } | null;
}

export type ChannelResolution<T extends ChannelLike> =
  | { status: "ok"; channel: T }
  | { status: "hidden"; reason: string }
  | { status: "missing"; reason: string }
  | { status: "error"; reason: string };

/** True when Discord has deliberately hidden this channel from the bot. */
export function isObfuscated(channel: ChannelLike | null | undefined): boolean {
  if (!channel) return false;
  if (channel.name === HIDDEN_NAME) return true;
  return Boolean(channel.flags && (channel.flags.bitfield & OBFUSCATED_FLAG) !== 0);
}

function errorCode(error: unknown): number | undefined {
  if (error instanceof DiscordAPIError) return Number(error.code);
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    return Number.isFinite(code) ? code : undefined;
  }
  return undefined;
}

/**
 * Resolve a channel by id. Pass the fetch itself so guild-scoped and
 * client-scoped call sites can share the same classification.
 *
 * 10003 = unknown channel, 50001 = missing access, 50013 = missing
 * permissions. The last two are "hidden" from the bot's point of view.
 */
export async function resolveChannel<T extends ChannelLike>(
  fetch: () => Promise<T | null>,
  channelId?: string,
): Promise<ChannelResolution<T>> {
  const label = channelId ?? "that channel";

  try {
    const channel = await fetch();
    if (!channel) {
      return { status: "missing", reason: `${label} no longer exists.` };
    }
    if (isObfuscated(channel)) {
      return {
        status: "hidden",
        reason: `${label} is hidden from the bot; check the channel's permissions or the channel is obfuscated.`,
      };
    }
    return { status: "ok", channel };
  } catch (error) {
    const code = errorCode(error);
    if (code === 10003) {
      return { status: "missing", reason: `${label} no longer exists.` };
    }
    if (code === 50001 || code === 50013) {
      return {
        status: "hidden",
        reason: `${label} is hidden from the bot; grant View Channel or check the channel's permissions.`,
      };
    }
    return {
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
