import { describe, expect, it } from "vitest";
import { ModuleRegistry, auditBudget } from "@keystone/kernel";
import { FakeInteraction, createTestContext } from "@keystone/testing";
import { CHANGELOG } from "./changelog";
import { about } from "./commands/about";
import { help } from "./commands/help";
import { ping } from "./commands/ping";
import { formatDuration } from "./format";
import { diagnosticsModule } from "./manifest";

describe("diagnostics module", () => {
  it("registers and fits the command budget", () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    expect(registry.commandNames()).toEqual(["ping", "about", "help"]);
    expect(auditBudget(registry).status).toBe("ok");
    expect(registry.catalog().find((entry) => entry.name === "help")?.subcommands).toHaveLength(5);
  });

  it("declares settings defaults that satisfy its own schema", () => {
    expect(diagnosticsModule.settingsSchema.parse(diagnosticsModule.defaultSettings)).toEqual({
      enabled: true,
      detailed: false,
    });
  });
});

describe("/ping", () => {
  it("replies with pong and uptime", async () => {
    const interaction = new FakeInteraction({ commandName: "ping" });
    const ctx = createTestContext({ interaction, moduleId: "diagnostics" });

    await ping.execute(ctx);

    expect(interaction.lastReply?.content).toMatch(/^Pong! Keystone has been up for /);
  });
});

describe("/about", () => {
  it("shows the module state for this guild", async () => {
    const interaction = new FakeInteraction({ commandName: "about", guildId: "guild-1" });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      settings: { enabled: false },
    });

    await about.execute(ctx);

    const embed = interaction.lastReply?.embeds?.[0];
    expect(embed?.title).toBe("Keystone");
    expect(embed?.fields?.find((field) => field.name === "Enabled here")?.value).toBe("no");
  });
});

describe("/help", () => {
  it("renders the live catalog with roots and subcommands", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const interaction = new FakeInteraction({ commandName: "help", subcommand: "commands" });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      catalog: registry.catalog(),
    });

    await help.execute(ctx);

    const embed = interaction.lastReply?.embeds?.[0];
    expect(embed?.title).toBe("Command catalog");
    expect(embed?.fields?.map((field) => field.name)).toContain("/help · 5 subcommands");
  });

  it("renders the server-aware V2 hub by default in a guild", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const interaction = new FakeInteraction({ commandName: "help" });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      catalog: registry.catalog(),
    });

    await help.execute(ctx);

    expect(interaction.lastReply?.ephemeral).toBe(true);
    expect(interaction.lastReply?.embeds).toBeUndefined();
    expect(interaction.lastReply?.v2?.[0]?.type).toBe("container");
    const json = JSON.stringify(interaction.lastReply?.v2);
    expect(json).toContain("## Keystone");
    expect(json).toContain("**This server**");
    expect(json).toContain("Pick a module");
  });

  it("keeps the flat card in a DM, where there is no server state or signed guild", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const interaction = new FakeInteraction({ commandName: "help", guildId: null });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      catalog: registry.catalog(),
    });

    await help.execute(ctx);

    expect(interaction.lastReply?.v2).toBeUndefined();
    expect(interaction.lastReply?.embeds?.[0]?.title).toBe("Keystone commands");
  });

  it("opens a module page directly for the module filter", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const interaction = new FakeInteraction({
      commandName: "help",
      subcommand: "browse",
      options: { module: "moderation" },
    });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      catalog: [
        ...registry.catalog(),
        {
          name: "mod",
          moduleId: "moderation",
          description: "Moderation",
          options: [],
          subcommands: [
            { name: "ban", description: "Ban a member", options: [] },
          ],
        },
      ],
    });

    await help.execute(ctx);

    const json = JSON.stringify(interaction.lastReply?.v2);
    expect(json).toContain("## moderation");
    expect(json).toContain("`ban`");
  });

  it("refuses the hub when no signer is wired", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const base = createTestContext({
      interaction: new FakeInteraction({ commandName: "help" }),
      moduleId: "diagnostics",
      catalog: registry.catalog(),
    });
    const ctx = { ...base, componentSigner: undefined } as unknown as typeof base;

    await expect(help.execute(ctx)).rejects.toThrow(/Interactive panels are not configured/);
  });

  it("searches roots and subcommands", async () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    const interaction = new FakeInteraction({
      commandName: "help",
      subcommand: "search",
      options: { query: "browse" },
    });
    const ctx = createTestContext({
      interaction,
      moduleId: "diagnostics",
      catalog: registry.catalog(),
    });

    await help.execute(ctx);

    expect(interaction.lastReply?.content).toContain("/help browse");
  });

  it("refuses clearly when dispatch did not inject a catalog", async () => {
    const interaction = new FakeInteraction({ commandName: "help", subcommand: "commands" });
    const ctx = createTestContext({ interaction, moduleId: "diagnostics" });
    await expect(help.execute(ctx)).rejects.toThrow(/catalog is not wired/i);
  });

  it("reports the newest changelog entry instead of a hard-coded pass", async () => {
    const interaction = new FakeInteraction({ commandName: "help", subcommand: "changelog" });
    const ctx = createTestContext({ interaction, moduleId: "diagnostics" });

    await help.execute(ctx);

    const embed = interaction.lastReply?.embeds?.[0];
    // The page shows a readable pass label; the id stays the machine truth.
    const newest = CHANGELOG[0]?.pass.replace(/^pass-/, "Pass ");
    expect(embed?.description).toContain(newest);
    expect(embed?.footer?.text).toBe(CHANGELOG[0]?.journal);
  });
});

describe("formatDuration", () => {
  it("omits leading zero units", () => {
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(90_061_000)).toBe("1d 1h 1m 1s");
  });
});
