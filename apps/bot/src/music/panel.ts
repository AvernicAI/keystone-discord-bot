import { MessageFlags, type Client } from "discord.js";
import type { ComponentSigner, Logger } from "@keystone/kernel";
import { musicPanel } from "@keystone/module-music";
import { toV2Components } from "../adapt";
import type {
  MusicPanelPort,
  MusicPanelPublishInput,
  MusicPanelRef,
} from "./playback";

/** One card edit every 1.5s; track start/pause/skip are the only triggers. */
export const MUSIC_PANEL_THROTTLE_MS = 1_500;

interface CardState {
  ref?: MusicPanelRef;
  pending?: MusicPanelPublishInput;
  timer?: NodeJS.Timeout;
  lastAt: number;
  /** One publish at a time per guild; a track start and its onStart event race. */
  chain: Promise<MusicPanelRef | undefined>;
}

/**
 * The Discord side of the player card: one message per guild, edited in place.
 *
 * It is deliberately throttled. Discord's edit budget is shared with every
 * other panel, and the big bots that edit a progress bar every few seconds are
 * the reason. A card changes only on a real state change; if two arrive inside
 * the window, the latest is published once when the window closes.
 *
 * A deleted or otherwise unrecoverable message (`10008`, `30046`, `50035`) must
 * not leave the player without a card, so the fallback is a fresh post.
 */
export function createMusicPanelPublisher(options: {
  readonly client: Client;
  readonly signer: ComponentSigner;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly throttleMs?: number;
}): MusicPanelPort {
  const now = options.now ?? Date.now;
  const throttleMs = options.throttleMs ?? MUSIC_PANEL_THROTTLE_MS;
  const cards = new Map<string, CardState>();

  async function render(input: MusicPanelPublishInput): Promise<MusicPanelRef | undefined> {
    const channel = await options.client.channels.fetch(input.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      throw new Error(`Channel ${input.channelId} is not a text channel I can post in.`);
    }
    const components = toV2Components(
      musicPanel(input.snapshot, input.queue, { signer: options.signer, readAt: now() }),
    );
    const state = cards.get(input.guildId) ?? { lastAt: 0, chain: Promise.resolve(undefined) };
    cards.set(input.guildId, state);
    state.lastAt = now();

    if (input.messageId) {
      try {
        const message = await channel.messages.fetch(input.messageId);
        await message.edit({ components, allowedMentions: { parse: [] } });
        return { channelId: input.channelId, messageId: message.id };
      } catch (error) {
        if (!isRecoverableCardError(error)) throw error;
        options.logger.warn("music card was stale; posting a fresh one", {
          guildId: input.guildId,
          channelId: input.channelId,
          code: errorCode(error),
        });
      }
    }

    const message = await channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return { channelId: input.channelId, messageId: message.id };
  }

  function stateFor(guildId: string): CardState {
    const existing = cards.get(guildId);
    if (existing) return existing;
    const created: CardState = { lastAt: 0, chain: Promise.resolve(undefined) };
    cards.set(guildId, created);
    return created;
  }

  async function publishNow(input: MusicPanelPublishInput): Promise<MusicPanelRef | undefined> {
    const state = stateFor(input.guildId);
    try {
      state.ref = await render({ ...input, ...(state.ref ? { messageId: state.ref.messageId } : {}) });
    } catch (error) {
      options.logger.warn("music card was not published", {
        guildId: input.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return state.ref;
  }

  /**
   * Serialize per guild. Two triggers for the same track start (the queue's
   * refresh and the node's `start` event) used to see no ref at the same time
   * and post two cards. With this chain the second call sees the first ref and
   * edits it.
   */
  function enqueue(state: CardState, input: MusicPanelPublishInput): Promise<MusicPanelRef | undefined> {
    state.chain = state.chain.then(
      () => publishNow(input),
      () => publishNow(input),
    );
    return state.chain;
  }

  return {
    async publish(input) {
      const state = stateFor(input.guildId);
      // The caller's message id is whatever the player knows; a fresh card has
      // none, so it must publish immediately.
      if (!state.ref) return enqueue(state, input);
      if (now() - state.lastAt >= throttleMs) {
        return enqueue(state, input);
      }
      state.pending = input;
      if (!state.timer) {
        state.timer = setTimeout(() => {
          state.timer = undefined;
          const pending = state.pending;
          state.pending = undefined;
          if (pending) void enqueue(state, pending);
        }, Math.max(0, throttleMs - (now() - state.lastAt)));
        state.timer.unref?.();
      }
      return state.ref;
    },
  };
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function isRecoverableCardError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 10008 || code === 30046 || code === 50035;
}
