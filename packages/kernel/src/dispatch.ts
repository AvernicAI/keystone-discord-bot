import { UserError } from "./errors";
import type { ModuleRegistry } from "./registry";
import type { SettingsService } from "./settings";
import { noopTelemetry } from "./telemetry";
import type {
  CommandContext,
  CooldownStore,
  HealthProbe,
  InteractionLike,
  JobQueue,
  Logger,
  ReplyInput,
  Telemetry,
} from "./types";

export interface DispatchDeps {
  registry: ModuleRegistry;
  settings: SettingsService;
  logger: Logger;
  /** Injected so the guard and the store cannot drift apart. */
  cooldowns: CooldownStore;
  queue: JobQueue;
  health: HealthProbe;
  /** Optional: absent in tests that do not exercise moderation. */
  moderation?: import("./types").ModerationPort;
  community?: import("./community").CommunityPort;
  ai?: import("./ai").AiPort;
  /** Optional: when absent, tracing is a no-op and costs nothing. */
  telemetry?: Telemetry;
  /** Injectable clock; defaults to the real one. */
  now?: () => number;
}

export type DispatchStatus = "ok" | "unknown-command" | "blocked" | "error";

export interface DispatchOutcome {
  status: DispatchStatus;
  message?: string;
}

async function respond(ctx: CommandContext, payload: ReplyInput): Promise<void> {
  const { interaction } = ctx;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    ctx.logger.error("failed to deliver response", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The one and only command pipeline: resolve → guard → execute → respond.
 *
 * Every feature goes through here, which is why cooldowns, permission checks
 * and error redaction cannot be forgotten by a module author. The whole run is
 * one span, so a trace can show the command, the database call inside it and
 * the job it enqueued under a single trace id.
 */
export async function dispatchCommand(
  deps: DispatchDeps,
  interaction: InteractionLike,
): Promise<DispatchOutcome> {
  const registered = deps.registry.getCommand(interaction.commandName);
  if (!registered) {
    deps.logger.warn("unknown command", { command: interaction.commandName });
    return { status: "unknown-command" };
  }

  const telemetry = deps.telemetry ?? noopTelemetry;
  const ctx: CommandContext = {
    interaction,
    moduleId: registered.moduleId,
    guildId: interaction.guildId,
    userId: interaction.userId,
    settings: deps.settings.forModule(registered.moduleId),
    logger: deps.logger.child(registered.moduleId),
    now: deps.now ?? Date.now,
    cooldowns: deps.cooldowns,
    queue: deps.queue,
    health: deps.health,
    moderation: deps.moderation,
    community: deps.community,
    ai: deps.ai,
  };

  try {
    return await telemetry.withSpan(`command ${interaction.commandName}`, async () => {
      for (const guard of registered.definition.guards ?? []) {
        const result = await guard(ctx);
        if (!result.ok) {
          await respond(ctx, { content: result.message, ephemeral: true });
          return { status: "blocked", message: result.message };
        }
      }

      await registered.definition.execute(ctx);
      return { status: "ok" };
    });
  } catch (error) {
    const userMessage =
      error instanceof UserError
        ? error.message
        : "Something went wrong. The error has been logged.";

    deps.logger.error("command failed", {
      command: interaction.commandName,
      module: registered.moduleId,
      guildId: interaction.guildId,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });

    await respond(ctx, { content: userMessage, ephemeral: true });
    return { status: "error", message: userMessage };
  }
}
