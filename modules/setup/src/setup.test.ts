import { describe, expect, it } from "vitest";
import {
  InMemoryCooldownStore,
  ModuleRegistry,
  SettingsService,
  auditBudget,
  createSilentLogger,
  dispatchCommand,
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
