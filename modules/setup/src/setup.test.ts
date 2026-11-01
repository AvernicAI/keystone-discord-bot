import { describe, expect, it } from "vitest";
import {
  InMemoryCooldownStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  auditBudget,
  createSilentLogger,
  dispatchCommand,
  type ExportImportOptions,
  type ExportPort,
  type HealthProbe,
  type SettingsRepository,
} from "@keystone/kernel";
import { FakeInteraction, createTestContext, noopQueue, staticHealth } from "@keystone/testing";
import { setupModule } from "./manifest";
import { setup } from "./commands/setup";

function fieldsFrom(interaction: FakeInteraction): Record<string, string> {
  const embed = interaction.lastReply?.embeds?.[0];
  return Object.fromEntries((embed?.fields ?? []).map((field) => [field.name, field.value]));
}

function readyHealth(): HealthProbe {
  return staticHealth({
    database: { configured: true, reachable: true, migrated: true, detail: "schema up to date" },
    cache: { configured: true, reachable: true, detail: "redis" },
    capabilities: {
      profile: "full",
      intents: [ { name: "Guilds", kind: "required", requested: true, modules: ["setup"] } ],
      disabledFeatures: [],
    },
  });
}

interface RunOptions {
  permissions?: string[];
  settings?: Record<string, unknown>;
  health?: HealthProbe;
}

async function runThroughDispatch(options: RunOptions = {}) {
  const registry = new ModuleRegistry().register(setupModule);

  let writes = 0;
  const repository: SettingsRepository = {
    async get() {
      return options.settings;
    },
    async set() {
      writes += 1;
      throw new Error("setup must never write");
    },
    async clear() {
      writes += 1;
      throw new Error("setup must never write");
    },
  };

  const interaction = new FakeInteraction({
    commandName: "setup",
    guildId: "guild-1",
    permissions: options.permissions ?? [],
  });

  const outcome = await dispatchCommand(
    {
      registry,
      settings: new SettingsService(repository, registry),
      logger: createSilentLogger(),
      cooldowns: new InMemoryCooldownStore(),
      queue: noopQueue,
      health: options.health ?? readyHealth(),
    },
    interaction,
  );

  return { outcome, interaction, writes };
}

async function runWithRepository(
  repository: SettingsRepository,
  subcommand: string,
  options: Record<string, string | number | boolean | null> = {},
) {
  const registry = new ModuleRegistry().register(setupModule);
  const settings = new SettingsService(repository, registry);
  const interaction = new FakeInteraction({
    commandName: "setup",
    subcommand,
    options,
    guildId: "guild-1",
    permissions: ["ManageGuild"],
  });

  const outcome = await dispatchCommand(
    {
      registry,
      settings,
      config: settings,
      logger: createSilentLogger(),
      cooldowns: new InMemoryCooldownStore(),
      queue: noopQueue,
      health: readyHealth(),
    },
    interaction,
  );
  return { outcome, interaction, settings };
}

describe("setup module", () => {
  it("registers through the normal registry and fits the budget", () => {
    const registry = new ModuleRegistry().register(setupModule);
    expect(registry.getCommand("setup")?.moduleId).toBe("setup");
    expect(auditBudget(registry).status).toBe("ok");
  });

  it("blocks a member without ManageGuild through the real dispatch pipeline", async () => {
    const { outcome, interaction, writes } = await runThroughDispatch({
      permissions: ["SendMessages"],
    });

    expect(outcome.status).toBe("blocked");
    expect(interaction.lastReply?.content).toContain("ManageGuild");
    expect(writes).toBe(0);
  });

  it("reports a fully ready deployment and writes nothing", async () => {
    const { outcome, interaction, writes } = await runThroughDispatch({
      permissions: ["ManageGuild"],
      settings: { enabled: true },
    });

    expect(outcome.status).toBe("ok");
    const fields = fieldsFrom(interaction);
    expect(fields.Database).toContain("ready");
    expect(fields.Database).toContain("schema up to date");
    expect(fields["Redis / cooldowns"]).toContain("ready");
    expect(fields["Gateway intents"]).toContain("profile: full");
    expect(fields["Gateway intents"]).toContain("every declared intent requested");
    expect(fields["Setup module"]).toBe("enabled here");
    expect(fields["Next step"]).toContain("/ping");
    expect(interaction.lastReply?.ephemeral).toBe(true);
    expect(writes).toBe(0);
  });

  it("reports a disabled module from its own settings", async () => {
    const { outcome, interaction } = await runThroughDispatch({
      permissions: ["ManageGuild"],
      settings: { enabled: false },
    });

    expect(outcome.status).toBe("ok");
    expect(fieldsFrom(interaction)["Setup module"]).toBe("disabled here");
  });

  it("names the exact fix when the database is missing", async () => {
    const interaction = new FakeInteraction({ commandName: "setup" });
    const ctx = createTestContext({ interaction, moduleId: "setup" });

    await setup.execute(ctx);

    const fields = fieldsFrom(interaction);
    expect(fields.Database).toContain("not configured");
    expect(fields["Next step"]).toContain("DATABASE_URL");
    expect(fields["Next step"]).toContain("pnpm db:migrate");
  });

  it("names the disabled features when the minimal intent profile is active", async () => {
    const { outcome, interaction } = await runThroughDispatch({
      permissions: ["ManageGuild"],
      settings: { enabled: true },
      health: staticHealth({
        database: { configured: true, reachable: true, migrated: true },
        cache: { configured: true, reachable: true },
        capabilities: {
          profile: "minimal",
          intents: [
            { name: "Guilds", kind: "required", requested: true, modules: ["setup"] },
            {
              name: "GuildMembers",
              kind: "optional",
              requested: false,
              modules: ["community"],
              fallback: "welcome and autorole are disabled",
            },
          ],
          disabledFeatures: ["GuildMembers: welcome and autorole are disabled"],
        },
      }),
    });

    expect(outcome.status).toBe("ok");
    const fields = fieldsFrom(interaction);
    expect(fields["Gateway intents"]).toContain("profile: minimal");
    expect(fields["Gateway intents"]).toContain("welcome and autorole are disabled");
    expect(fields["Next step"]).toContain("INTENT_PROFILE=full");
  });

  it("lists modules and changes one through the shared settings service", async () => {
    const repository = new InMemorySettingsRepository();

    const listed = await runWithRepository(repository, "module");
    expect(listed.outcome.status).toBe("ok");
    expect(listed.interaction.lastReply?.content).toContain("1 modules");

    const changed = await runWithRepository(repository, "module", {
      module: "setup",
      enabled: false,
    });
    expect(changed.outcome.status).toBe("ok");
    expect(changed.interaction.lastReply?.content).toContain("now disabled");
    expect(await changed.settings.get("guild-1", "setup")).toMatchObject({ enabled: false });

    const inspected = await runWithRepository(repository, "module", { module: "setup" });
    expect(inspected.interaction.lastReply?.content).toContain("is disabled here");
  });

  it("resets only the selected module's stored settings", async () => {
    const repository = new InMemorySettingsRepository();
    await repository.set("guild-1", "setup", { enabled: false });

    const { outcome, interaction, settings } = await runWithRepository(repository, "reset", {
      module: "setup",
    });
    expect(outcome.status).toBe("ok");
    expect(interaction.lastReply?.content).toContain("Reset `setup`");
    expect(await settings.get("guild-1", "setup")).toMatchObject({ enabled: true });
  });

  it("verifies settings parsing and the command catalog without writing", async () => {
    const { outcome, interaction, settings } = await runWithRepository(
      new InMemorySettingsRepository(),
      "verify",
    );
    expect(outcome.status).toBe("ok");
    const fields = fieldsFrom(interaction);
    expect(fields.Settings).toContain("modules parsed");
    expect(fields.Commands).toContain("roots");
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("Every check passed");
    expect(await settings.get("guild-1", "setup")).toMatchObject({ enabled: true });
  });

  it("previews an attached bundle and never asks the port to apply it", async () => {
    let received: ExportImportOptions | undefined;
    const exportPort = {
      async importBundle(_guildId: string, _text: string, options: ExportImportOptions) {
        received = options;
        return {
          state: "dry-run" as const,
          counts: { settings: 2, cases: 1 },
          warnings: [],
        };
      },
    } as unknown as ExportPort;
    const interaction = new FakeInteraction({
      commandName: "setup",
      subcommand: "import",
      guildId: "guild-1",
      permissions: ["ManageGuild"],
      options: { bundle: "https://cdn.discordapp.com/bundle.json", mode: "merge" },
    });
    const ctx = createTestContext({
      interaction,
      moduleId: "setup",
      export: exportPort,
      attachments: { read: async () => "{\"version\":1}" },
    });

    await setup.execute(ctx);

    expect(received).toMatchObject({ mode: "merge", dryRun: true });
    expect(interaction.lastReply?.content).toContain("Import preview");
    expect(interaction.lastReply?.content).toContain("2 settings");
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("no rows were written");
  });

  it("does not claim readiness when migrations are pending", async () => {
    const interaction = new FakeInteraction({ commandName: "setup" });
    const ctx = createTestContext({
      interaction,
      moduleId: "setup",
      health: staticHealth({
        database: { configured: true, reachable: true, migrated: false, detail: "1 pending migration(s)" },
      }),
    });

    await setup.execute(ctx);

    const fields = fieldsFrom(interaction);
    expect(fields.Database).toContain("not ready");
    expect(fields["Next step"]).toContain("pnpm db:migrate");
  });
});
