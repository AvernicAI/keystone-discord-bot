import "dotenv/config";
import { Events, Routes } from "discord.js";
import {
  ModuleRegistry,
  UserError,
  auditBudget,
  createLogger,
  dispatchCommand,
  formatBudgetReport,
  type DispatchDeps,
} from "@keystone/kernel";
import { loadEnv, requireToken } from "@keystone/config";
import { asInteractionLike, buildCommandJson } from "./adapt";
import { commandDrift, hasDrift, type CommandJson } from "./command-sync";
import { createClient } from "./client";
import { modules } from "./modules";
import { createRuntime } from "./runtime";
import { createDiscordModerationActions } from "./moderation-actions";
import { registerModerationEvents } from "./moderation-events";
import { syncNativeAutoModRules } from "./automod";
import { createDiscordCommunityActions } from "./community-actions";
import { registerCommunityEvents } from "./community-events";
import { createDiscordInviteActions } from "./invites-actions";
import { registerInviteEvents } from "./invite-events";
import { createDiscordLoggingActions } from "./logging-actions";
import { registerLoggingEvents } from "./logging-events";
import { registerAiEvents } from "./ai-events";
import { registerPrefixCommands } from "./prefix";
import { LoggingService } from "@keystone/module-logging";
import { buildNativeAutoModPlan, moderationSettingsSchema } from "@keystone/module-moderation";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger("keystone", env.LOG_LEVEL);
  const token = requireToken(env);

  const registry = new ModuleRegistry().registerAll(modules);
  const budget = auditBudget(registry);

  if (env.NODE_ENV !== "production") {
    console.log(formatBudgetReport(budget));
  }
  logger.info("command budget", {
    commands: budget.commands,
    limit: budget.limit,
    status: budget.status,
  });

  if (budget.status === "fail") {
    logger.error("refusing to start: command budget exceeded", { violations: budget.violations });
    process.exitCode = 1;
    return;
  }

  const intentNames = registry.intentsForProfile(env.INTENT_PROFILE);
  const capabilities = registry.capabilityReport(env.INTENT_PROFILE);
  logger.info("intent profile", {
    profile: env.INTENT_PROFILE,
    requested: intentNames,
    disabledFeatures: capabilities.disabledFeatures,
  });
  const client = createClient(intentNames);
  const runtime = await createRuntime(
    env,
    registry,
    logger,
    createDiscordModerationActions(client),
    createDiscordCommunityActions(client),
    createDiscordInviteActions(client, logger.child("invites")),
    createDiscordLoggingActions(client, logger.child("logging")),
  );
  logger.info("runtime ready", runtime.mode);

  const dispatchDeps: DispatchDeps = {
    registry,
    settings: runtime.settings,
    logger,
    cooldowns: runtime.cooldowns,
    queue: runtime.queue,
    health: runtime.health,
    telemetry: runtime.telemetry,
    moderation: runtime.moderation,
    community: runtime.community,
    invites: runtime.invites,
    ai: runtime.ai,
    logging: runtime.logging,
  };

  const loggingService = new LoggingService(
    runtime.logging.store,
    runtime.logging.actions,
    runtime.settings.forModule("logging"),
  );

  client.once(Events.ClientReady, async (ready) => {
    logger.info("ready", {
      user: ready.user.tag,
      guilds: ready.guilds.cache.size,
      modules: registry.listModules().length,
    });

    try {
      // Discord replaces the whole global command set with one bulk overwrite,
      // so a clear on every boot is unnecessary. Clearing first also risks a
      // 429 between the two writes and leaves the app with no commands. When
      // the server set has drifted, however, do the explicit clear + register
      // cycle and read the result back. `pnpm commands:resync` runs the same
      // cycle on demand after a payload-only change.
      const payload = registry.listCommands().map((c) => buildCommandJson(c.definition));
      // Compare Discord's raw REST representation, not discord.js wrappers:
      // a wrapper may normalise fields and report drift forever after a
      // successful registration. `commands:doctor` reads the same endpoint.
      const readServerCommands = async (): Promise<CommandJson[]> =>
        (await ready.rest.get(
          Routes.applicationCommands(ready.application.id),
        )) as CommandJson[];
      let synced = await ready.application.commands.fetch();
      const drift = commandDrift(payload, await readServerCommands());

      if (hasDrift(drift)) {
        logger.warn("command set drift; clearing before re-register", { ...drift });
        await ready.application.commands.set([]);
        await ready.application.commands.set(payload);
        synced = await ready.application.commands.fetch();
        logger.info("commands re-registered", { count: synced.size });
      } else {
        logger.info("commands current", { count: synced.size });
      }

      const finalDrift = commandDrift(payload, await readServerCommands());
      if (hasDrift(finalDrift)) {
        logger.error("command sync mismatch", { ...finalDrift });
      }
      for (const guild of ready.guilds.cache.values()) {
        try {
          const settings = moderationSettingsSchema.parse(
            await runtime.settings.get(guild.id, "moderation"),
          );
          if (settings.nativeAutoMod.sync) {
            const synced = await syncNativeAutoModRules(guild, buildNativeAutoModPlan(settings));
            logger.info("native automod synced", { guild: guild.id, rules: synced });
          }
        } catch (error) {
          logger.warn("native automod sync skipped", {
            guild: guild.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        try {
          const pruned = await loggingService.prune(guild.id);
          if (pruned > 0) logger.info("logging retention pruned", { guild: guild.id, pruned });
        } catch (error) {
          logger.warn("logging retention failed", {
            guild: guild.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.error("command registration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void dispatchCommand(dispatchDeps, asInteractionLike(interaction)).catch((error: unknown) => {
      logger.error("dispatch crashed", {
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
    });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton() || !interaction.guildId) return;
    const guildId = interaction.guildId;

    if (interaction.customId.startsWith("keystone:appeal:")) {
      const caseId = interaction.customId.slice("keystone:appeal:".length);
      void (async () => {
        try {
          const settings = moderationSettingsSchema.parse(
            await runtime.settings.get(guildId, "moderation"),
          );
          if (!settings.appealsEnabled) {
            await interaction.reply({ content: "Appeals are disabled in this server.", ephemeral: true });
            return;
          }
          const record = await runtime.moderation.cases.appealById(
            caseId,
            interaction.user.id,
            "Appeal requested from the case button.",
          );
          await interaction.reply({
            content: `Appeal opened for case #${record.caseNumber}. A moderator can review it with /mod review.`,
            ephemeral: true,
          });
        } catch (error) {
          await interaction.reply({
            content: error instanceof UserError ? error.message : "Could not open that appeal.",
            ephemeral: true,
          });
        }
      })();
      return;
    }

    if (interaction.customId.startsWith("keystone:verify:")) {
      const userId = interaction.customId.slice("keystone:verify:".length);
      if (interaction.user.id !== userId) {
        void interaction.reply({ content: "This verification belongs to another member.", ephemeral: true });
        return;
      }
      void (async () => {
        try {
          const settings = moderationSettingsSchema.parse(
            await runtime.settings.get(guildId, "moderation"),
          );
          const result = await runtime.moderation.actions.unquarantine(
            guildId,
            userId,
            "Verification button completed",
            settings.quarantineRoleId,
          );
          await interaction.reply({
            content: result.ok
              ? "Verified. Quarantine has been lifted."
              : `Could not verify: ${result.detail ?? "unknown error"}`,
            ephemeral: true,
          });
        } catch (error) {
          await interaction.reply({
            content: error instanceof Error ? error.message : "Could not verify you.",
            ephemeral: true,
          });
        }
      })();
    }
  });

  const devTestGuild =
    env.NODE_ENV !== "production" && env.DEV_GUILD_ID ? env.DEV_GUILD_ID : undefined;
  registerModerationEvents(client, runtime.security, logger, {
    botTestGuildId: devTestGuild,
  });
  const stopCommunity = registerCommunityEvents(
    client,
    runtime.community,
    runtime.settings.forModule("community"),
    logger.child("community"),
    { botTestGuildId: devTestGuild },
  );
  registerInviteEvents(
    client,
    runtime.invites,
    runtime.settings.forModule("invites"),
    logger.child("invites"),
  );
  const stopLogging = registerLoggingEvents(
    client,
    runtime.logging,
    runtime.settings.forModule("logging"),
    logger.child("logging"),
    { botTestGuildId: devTestGuild },
  );
  const retentionTimer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      void loggingService.prune(guild.id).catch((error: unknown) => {
        logger.warn("logging retention failed", {
          guild: guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }, 6 * 60 * 60_000);
  retentionTimer.unref();
  // One explicit development surface, never present in production: message
  // authors (including the MCP bot) can run the real pipeline with `!`, and
  // bot-authored mentions reach the AI event. Both are restricted to this
  // guild, so a test harness cannot widen the production behaviour.
  const stopPrefix = devTestGuild
    ? registerPrefixCommands(client, dispatchDeps, { guildId: devTestGuild })
    : () => undefined;
  if (devTestGuild) {
    logger.warn("development prefix commands enabled", { guildId: devTestGuild, prefix: "!" });
  }
  const stopAi = registerAiEvents(client, runtime.ai, logger.child("ai"), {
    allowBotsInGuildId: devTestGuild,
  });

  client.on(Events.Error, (error) => logger.error("client error", { error: error.message }));
  client.on(Events.Warn, (message) => logger.warn("client warning", { message }));

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    clearInterval(retentionTimer);
    stopCommunity();
    stopLogging();
    stopPrefix();
    stopAi();
    await client.destroy();
    await runtime.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await client.login(token);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
