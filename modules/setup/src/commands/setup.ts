import { defineCommand, requireGuild, requirePermissions } from "@keystone/kernel";

function mark(ready: boolean): string {
  return ready ? "ready" : "not ready";
}

/**
 * `/setup` answers one question: is this deployment actually ready?
 *
 * It reads the health port and this module's own settings, and never touches
 * another module's configuration. Every failing line names the fix.
 */
export const setup = defineCommand({
  name: "setup",
  description: "Check database, migrations, cache and module readiness.",
  guards: [requireGuild, requirePermissions("ManageGuild")],
  async execute(ctx) {
    const guildId = ctx.guildId;
    if (!guildId) return; // requireGuild guarantees it; keeps TypeScript honest.

    const [health, settings] = await Promise.all([
      ctx.health.probe(),
      ctx.settings.get(guildId),
    ]);

    const databaseReady = health.database.reachable && health.database.migrated;
    const cacheReady = health.cache.configured && health.cache.reachable;
    const moduleEnabled = settings.enabled === true;
    const capabilities = health.capabilities;
    const disabled = capabilities?.disabledFeatures ?? [];

    const intentValue = capabilities
      ? [
          `profile: ${capabilities.profile}`,
          disabled.length > 0 ? `disabled: ${disabled.join("; ")}` : "every declared intent requested",
        ].join("\n")
      : "not reported";

    const databaseValue = health.database.configured
      ? [
          `${mark(databaseReady)} · migrations ${health.database.migrated ? "applied" : "pending"}`,
          health.database.detail,
        ]
          .filter(Boolean)
          .join("\n")
      : "not configured · settings are in memory and reset on restart";

    const cacheValue = health.cache.configured
      ? `${mark(cacheReady)}${health.cache.detail ? ` · ${health.cache.detail}` : ""}`
      : "not configured · cooldowns are process-local";

    const next = !health.database.configured
      ? "Set `DATABASE_URL` in `.env`, then run `pnpm db:migrate`."
      : !health.database.reachable
        ? "The database is configured but unreachable. Check the URL and that Postgres is running."
        : !health.database.migrated
          ? "Run `pnpm db:migrate` — migrations are an explicit step, never run on boot."
          : !health.cache.configured
            ? "Optional: set `REDIS_URL` to share cooldowns and run jobs in the worker."
            : disabled.length > 0
              ? "Core is ready. Set `INTENT_PROFILE=full` and enable the optional intents in the Developer Portal to turn on the features named above."
              : "Everything needed is ready. Try `/ping`, then `/about`.";

    await ctx.interaction.reply({
      ephemeral: true,
      embeds: [
        {
          title: "Keystone setup — readiness",
          description: "This command only reads state. Nothing was changed.",
          color: databaseReady ? 0x57f287 : 0xfee75c,
          fields: [
            { name: "Database", value: databaseValue },
            { name: "Redis / cooldowns", value: cacheValue },
            { name: "Gateway intents", value: intentValue },
            { name: "Setup module", value: moduleEnabled ? "enabled here" : "disabled here", inline: true },
            { name: "Next step", value: next },
          ],
          footer: { text: "Settings are per guild; secrets never appear in this output." },
        },
      ],
    });
  },
  notes:
    "The first command a new operator runs. It reports readiness instead of writing config, so a failed database cannot leave a server half-configured.",
});
