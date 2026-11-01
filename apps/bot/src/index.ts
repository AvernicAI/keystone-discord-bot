import "dotenv/config";
import { Events } from "discord.js";
import {
  ModuleRegistry,
  UserError,
  auditBudget,
  createLogger,
  dispatchCommand,
  formatBudgetReport,
} from "@keystone/kernel";
import { loadEnv, requireToken } from "@keystone/config";
import { asInteractionLike, buildCommandJson } from "./adapt";
import { createClient } from "./client";
import { modules } from "./modules";
import { createRuntime } from "./runtime";
import { createDiscordModerationActions } from "./moderation-actions";
import { registerModerationEvents } from "./moderation-events";
import { syncNativeAutoModRules } from "./automod";
import { createDiscordCommunityActions } from "./community-actions";
import { registerCommunityEvents } from "./community-events";
import { registerAiEvents } from "./ai-events";
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
  );
  logger.info("runtime ready", runtime.mode);

  client.once(Events.ClientReady, async (ready) => {
    logger.info("ready", {
      user: ready.user.tag,
      guilds: ready.guilds.cache.size,
      modules: registry.listModules().length,
    });

    try {
      await ready.application.commands.set(registry.listCommands().map((c) => buildCommandJson(c.definition)));
      logger.info("commands registered", { count: registry.commandCount });
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
      }
    } catch (error) {
      logger.error("command registration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void dispatchCommand(
      {
        registry,
        settings: runtime.settings,
        logger,
        cooldowns: runtime.cooldowns,
        queue: runtime.queue,
        health: runtime.health,
        telemetry: runtime.telemetry,
        moderation: runtime.moderation,
        community: runtime.community,
        ai: runtime.ai,
      },
      asInteractionLike(interaction),
    ).catch((error: unknown) => {
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

  registerModerationEvents(client, runtime.security, logger);
  const stopCommunity = registerCommunityEvents(
    client,
    runtime.community,
    runtime.settings.forModule("community"),
    logger.child("community"),
  );
  const stopAi = registerAiEvents(client, runtime.ai, logger.child("ai"));

  client.on(Events.Error, (error) => logger.error("client error", { error: error.message }));
  client.on(Events.Warn, (message) => logger.warn("client warning", { message }));

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    stopCommunity();
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
