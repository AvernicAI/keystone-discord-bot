import { describe, expect, it } from "vitest";
import { ModuleRegistry, auditBudget } from "@keystone/kernel";
import { FakeInteraction, createTestContext } from "@keystone/testing";
import { about } from "./commands/about";
import { ping } from "./commands/ping";
import { formatDuration } from "./format";
import { diagnosticsModule } from "./manifest";

describe("diagnostics module", () => {
  it("registers and fits the command budget", () => {
    const registry = new ModuleRegistry().register(diagnosticsModule);
    expect(registry.commandNames()).toEqual(["ping", "about"]);
    expect(auditBudget(registry).status).toBe("ok");
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

describe("formatDuration", () => {
  it("omits leading zero units", () => {
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(90_061_000)).toBe("1d 1h 1m 1s");
  });
});
