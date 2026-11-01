import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryCooldownStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  auditBudget,
  auditMeasurements,
  createSilentLogger,
  defineCommand,
  defineModule,
  dispatchCommand,
  formatBudgetReport,
} from "./index";
import { FakeInteraction, noopQueue, staticHealth } from "./testing";

function demoModule() {
  return defineModule({
    id: "demo",
    name: "Demo",
    description: "Context-menu fixtures",
    version: "0.0.1",
    settingsSchema: z.object({}),
    defaultSettings: {},
    commands: [
      defineCommand({
        name: "demo",
        description: "A chat-input root",
        async execute(ctx) {
          await ctx.interaction.reply({ content: "root" });
        },
      }),
      defineCommand({
        name: "Report message",
        description: "Report a message",
        type: "message",
        async execute(ctx) {
          await ctx.interaction.reply({ content: `message:${ctx.interaction.targetId}` });
        },
      }),
      defineCommand({
        name: "Rank card",
        description: "Show a rank card",
        type: "user",
        async execute(ctx) {
          await ctx.interaction.reply({ content: `user:${ctx.interaction.targetId}` });
        },
      }),
    ],
  });
}

describe("context menus in the registry", () => {
  it("separates chat-input roots from user and message menus", () => {
    const registry = new ModuleRegistry().register(demoModule());
    expect(registry.commandNames()).toEqual(["demo"]);
    expect(registry.contextMenuNames()).toEqual(["Report message", "Rank card"]);
    expect(registry.commandCount).toBe(1);
    expect(registry.contextMenuCount).toBe(2);
    expect(registry.getCommand("Report message", "message")?.moduleId).toBe("demo");
    expect(registry.getCommand("Report message", "user")).toBeUndefined();
    expect(registry.catalog().find((entry) => entry.name === "Rank card")?.type).toBe("user");
  });

  it("counts both context-menu budgets separately from the 100 roots", () => {
    const report = auditBudget(new ModuleRegistry().register(demoModule()));
    expect(report.commands).toBe(1);
    expect(report.subcommands).toBe(0);
    expect(report.contextMenus).toBe(2);
    expect(report.userContextMenus).toBe(1);
    expect(report.messageContextMenus).toBe(1);
    const text = formatBudgetReport(report);
    expect(text).toContain("2 context menus");
    expect(text).toContain("Report message");
  });

  it("fails when a context-menu budget is exceeded", () => {
    const report = auditMeasurements(
      Array.from({ length: 16 }, (_, index) => ({
        name: `menu-${index}`,
        moduleId: "demo",
        type: "user" as const,
        subcommands: 0,
        options: 0,
        payloadChars: 20,
      })),
    );
    expect(report.status).toBe("fail");
    expect(report.violations.join(" ")).toContain("16 user context menus");
  });

  it("rejects options and subcommands on a context menu", () => {
    const withOptions = defineModule({
      ...demoModule(),
      commands: [
        defineCommand({
          name: "Report message",
          description: "Report",
          type: "message",
          options: [{ type: "string", name: "reason", description: "Why" }],
          async execute() {
            /* no-op */
          },
        }),
      ],
    });
    expect(() => new ModuleRegistry().register(withOptions)).toThrow(/cannot declare options/);

    const withSubcommands = defineModule({
      ...demoModule(),
      commands: [
        defineCommand({
          name: "Report message",
          description: "Report",
          type: "message",
          subcommands: [{ name: "now", description: "Now" }],
          async execute() {
            /* no-op */
          },
        }),
      ],
    });
    expect(() => new ModuleRegistry().register(withSubcommands)).toThrow(/cannot declare subcommands/);
  });

  it("dispatches a user menu by type and exposes targetId", async () => {
    const registry = new ModuleRegistry().register(demoModule());
    const interaction = new FakeInteraction({
      commandName: "Rank card",
      commandType: "user",
      targetId: "author-1",
    });
    const outcome = await dispatchCommand(
      {
        registry,
        settings: new SettingsService(new InMemorySettingsRepository(), registry),
        logger: createSilentLogger(),
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
        now: () => 1_700_000_000_000,
      },
      interaction,
    );
    expect(outcome.status).toBe("ok");
    expect(interaction.lastReply?.content).toBe("user:author-1");
  });

  it("does not resolve a menu name as a chat-input root", async () => {
    const registry = new ModuleRegistry().register(demoModule());
    const interaction = new FakeInteraction({ commandName: "Rank card", commandType: "chat-input" });
    const outcome = await dispatchCommand(
      {
        registry,
        settings: new SettingsService(new InMemorySettingsRepository(), registry),
        logger: createSilentLogger(),
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
      },
      interaction,
    );
    expect(outcome.status).toBe("unknown-command");
  });
});
