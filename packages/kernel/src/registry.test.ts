import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ModuleRegistry,
  auditBudget,
  auditMeasurements,
  defineCommand,
  defineModule,
  formatBudgetReport,
  type ModuleManifest,
} from "./index";

function makeModule(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  const base = defineModule({
    id: "demo",
    name: "Demo",
    description: "A demo module",
    version: "0.0.1",
    settingsSchema: z.object({ volume: z.number().int().min(0).max(10).default(5) }),
    defaultSettings: { volume: 5 },
    commands: [
      defineCommand({
        name: "demo",
        description: "A demo command",
        async execute() {
          /* no-op */
        },
      }),
    ],
  });
  return { ...base, ...overrides };
}

describe("ModuleRegistry", () => {
  it("registers a module and resolves its command", () => {
    const registry = new ModuleRegistry().register(makeModule());
    expect(registry.getCommand("demo")?.moduleId).toBe("demo");
    expect(registry.commandCount).toBe(1);
  });

  it("rejects a command name claimed by two modules", () => {
    const registry = new ModuleRegistry().register(makeModule());
    const other = makeModule({
      id: "other",
      commands: [
        defineCommand({
          name: "demo",
          description: "Same name",
          async execute() {
            /* no-op */
          },
        }),
      ],
    });

    expect(() => registry.register(other)).toThrow(/already owned by "demo"/);
  });

  it("rejects an invalid module id", () => {
    expect(() => new ModuleRegistry().register(makeModule({ id: "Not Kebab" }))).toThrow(
      /Invalid module/,
    );
  });

  it("rejects default settings that violate the module's own schema", () => {
    const manifest = makeModule({
      settingsSchema: z.object({ volume: z.number() }),
      defaultSettings: { volume: "loud" },
    });
    expect(() => new ModuleRegistry().register(manifest)).toThrow(/defaultSettings/);
  });

  it("rejects a required option that follows an optional one", () => {
    const manifest = makeModule({
      commands: [
        defineCommand({
          name: "ordered",
          description: "Bad ordering",
          options: [
            { type: "string", name: "first", description: "optional" },
            { type: "string", name: "second", description: "required", required: true },
          ],
          async execute() {
            /* no-op */
          },
        }),
      ],
    });
    expect(() => new ModuleRegistry().register(manifest)).toThrow(/cannot follow an optional/);
  });

  it("unions intents across modules and sorts them", () => {
    const registry = new ModuleRegistry()
      .register(makeModule({ intents: ["GuildMembers"] }))
      .register(
        makeModule({
          id: "second",
          commands: [
            defineCommand({
              name: "second",
              description: "A second command",
              async execute() {
                /* no-op */
              },
            }),
          ],
          intents: ["Guilds", "GuildMembers"],
        }),
      );
    expect(registry.intents()).toEqual(["GuildMembers", "Guilds"]);
  });
});

describe("auditBudget", () => {
  it("passes for a small bot", () => {
    const report = auditBudget(new ModuleRegistry().register(makeModule()));
    expect(report.status).toBe("ok");
    expect(report.remaining).toBe(99);
    expect(formatBudgetReport(report)).toContain("/demo");
  });

  it("fails when Discord's 100 global commands are exceeded", () => {
    const commands = Array.from({ length: 101 }, (_, index) =>
      defineCommand({
        name: `cmd-${index}`,
        description: "Bulk command",
        async execute() {
          /* no-op */
        },
      }),
    );

    const report = auditBudget(new ModuleRegistry().register(makeModule({ commands })));
    expect(report.status).toBe("fail");
    expect(report.violations.join(" ")).toContain("101 global commands");
  });

  it("measures every registered command", () => {
    const report = auditBudget(new ModuleRegistry().register(makeModule()));
    expect(report.perCommand).toHaveLength(1);
    expect(report.perCommand[0]?.payloadChars).toBeGreaterThan(0);
  });

  it("fails when a measured command exceeds Discord's payload cap", () => {
    // Manifest validation rejects >25 options and >100-char descriptions, so a
    // valid command cannot currently reach 8,000 chars. The check stays as a
    // guard for localisation, and this is how we prove it still fires.
    const report = auditMeasurements([
      { name: "huge", moduleId: "demo", options: 25, payloadChars: 8_001 },
    ]);
    expect(report.status).toBe("fail");
    expect(report.violations.join(" ")).toContain("max 8000");
  });

  it("fails when a measured command has too many options", () => {
    const report = auditMeasurements([
      { name: "wide", moduleId: "demo", options: 26, payloadChars: 100 },
    ]);
    expect(report.status).toBe("fail");
    expect(report.violations.join(" ")).toContain("max 25");
  });
});
