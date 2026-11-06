import {
  UserError,
  type ComponentRouter,
  type ComponentRouteContext,
  type ModuleSettings,
  type MusicLoopMode,
  type MusicPlayback,
  type MusicPlayerSnapshot,
} from "@keystone/kernel";
import {
  DJ_REFUSAL,
  MUSIC_DISABLED_MESSAGE,
  isDj,
  musicSettingsSchema,
} from "@keystone/module-music";

export interface MusicRouteDeps {
  readonly playback: MusicPlayback;
  readonly settings: ModuleSettings;
}

type Handler = (
  context: ComponentRouteContext,
  deps: MusicRouteDeps,
  snapshot: MusicPlayerSnapshot,
) => Promise<string>;

const CARD_TTL_ERROR = "Nothing is playing in this server. Start a track with `/music play`.";

/**
 * The player card's controls. Every route is guild-only and signed; the DJ gate
 * is evaluated here because it needs the clicker's roles, which the router does
 * not interpret. The player itself has no policy and only changes audio.
 */
export function registerMusicRoutes(
  router: ComponentRouter,
  deps: MusicRouteDeps,
): void {
  const button = (action: string, handler: Handler): void => {
    router.register({
      namespace: "music",
      action,
      kind: "button",
      guildOnly: true,
      handle: (context) => run(context, deps, handler),
    });
  };

  button("toggle", async (context, routeDeps, snapshot) => {
    const paused = snapshot.state === "paused";
    const result = await routeDeps.playback.pause(context.guildId as string, !paused);
    return accepted(result, paused ? "Resumed." : "Paused.");
  });
  button("skip", async (context, routeDeps, snapshot) => {
    const result = await routeDeps.playback.skip(context.guildId as string);
    return result.track ? `Skipped to ${result.track.title}.` : accepted(result, "Skipped.");
  });
  button("stop", async (context, routeDeps) => {
    const result = await routeDeps.playback.stop(context.guildId as string);
    return accepted(result, "Stopped and left voice.");
  });
  button("shuffle", async (context, routeDeps, snapshot) => {
    if (snapshot.queueCount < 3) throw new UserError("There are fewer than three tracks to shuffle.");
    const result = await routeDeps.playback.shuffle(context.guildId as string);
    return accepted(result, "Shuffled.");
  });
  button("loop", async (context, routeDeps, snapshot) => {
    const next: MusicLoopMode =
      snapshot.loop === "off" ? "track" : snapshot.loop === "track" ? "queue" : "off";
    const result = await routeDeps.playback.setLoop(context.guildId as string, next);
    return accepted(result, `Loop is ${next}.`);
  });
  button("voldown", async (context, routeDeps, snapshot) => {
    const result = await routeDeps.playback.setVolume(
      context.guildId as string,
      Math.max(0, snapshot.volume - 10),
    );
    return accepted(result, "Volume lowered.");
  });
  button("volup", async (context, routeDeps, snapshot) => {
    const result = await routeDeps.playback.setVolume(
      context.guildId as string,
      Math.min(200, snapshot.volume + 10),
    );
    return accepted(result, "Volume raised.");
  });

  router.register({
    namespace: "music",
    action: "jump",
    kind: "select",
    guildOnly: true,
    handle: (context) =>
      run(context, deps, async (routeContext, routeDeps) => {
        const value = routeContext.interaction.values?.[0];
        const position = Number.parseInt(value ?? "", 10);
        if (!Number.isFinite(position) || position < 1) {
          throw new UserError("Choose a queued track.");
        }
        const result = await routeDeps.playback.jump(routeContext.guildId as string, position);
        return result.track ? `Jumped to ${result.track.title}.` : accepted(result, "Jumped.");
      }),
  });
}

/** A card never prints "Paused." when the player refused; it raises the reason. */
function accepted(result: { ok: boolean; detail?: string }, fallback: string): string {
  if (!result.ok) throw new UserError(result.detail ?? fallback);
  return result.detail ?? fallback;
}

async function run(
  context: ComponentRouteContext,
  deps: MusicRouteDeps,
  handler: Handler,
): Promise<void> {
  const settings = musicSettingsSchema.parse(
    await deps.settings.get(context.guildId as string),
  );
  if (!settings.enabled) throw new UserError(MUSIC_DISABLED_MESSAGE);
  if (
    !isDj(settings, {
      permissions: context.interaction.permissions,
      ...(context.interaction.roleIds ? { roleIds: context.interaction.roleIds } : {}),
    })
  ) {
    throw new UserError(DJ_REFUSAL);
  }
  const snapshot = await deps.playback.snapshot(context.guildId as string);
  if (!snapshot || snapshot.state === "idle") throw new UserError(CARD_TTL_ERROR);

  const message = await handler(context, deps, snapshot);
  await context.interaction.reply({ content: message, ephemeral: true });
}
