import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  defineCommand,
  defineModule,
} from "./index";

function buildService(): SettingsService {
  const registry = new ModuleRegistry().register(
    defineModule({
      id: "levels",
      name: "Levels",
      description: "Test module",
      version: "0.0.1",
      settingsSchema: z.object({
        enabled: z.boolean().default(true),
        xpPerMessage: z.number().int().min(1).max(100).default(15),
      }),
      defaultSettings: { enabled: true, xpPerMessage: 15 },
      commands: [
        defineCommand({
          name: "levels",
          description: "Levels",
          async execute() {
            /* no-op */
          },
        }),
      ],
    }),
  );
  return new SettingsService(new InMemorySettingsRepository(), registry);
}

describe("SettingsService", () => {
  it("returns schema-parsed defaults for a guild that has never been configured", async () => {
    const settings = await buildService().get("guild-1", "levels");
    expect(settings).toEqual({ enabled: true, xpPerMessage: 15 });
  });

  it("merges a partial update over existing values", async () => {
    const service = buildService();
    await service.update("guild-1", "levels", { xpPerMessage: 30 });
    expect(await service.get("guild-1", "levels")).toEqual({ enabled: true, xpPerMessage: 30 });
  });

  it("rejects an update that violates the module schema", async () => {
    await expect(
      buildService().update("guild-1", "levels", { xpPerMessage: 10_000 }),
    ).rejects.toThrow();
  });

  it("keeps guilds isolated", async () => {
    const service = buildService();
    await service.update("guild-1", "levels", { enabled: false });
    expect((await service.get("guild-2", "levels")).enabled).toBe(true);
  });

  it("hands commands a handle bound to their own module", async () => {
    const handle = buildService().forModule("levels");
    expect(await handle.get("guild-1")).toEqual({ enabled: true, xpPerMessage: 15 });
  });

  it("refuses to read settings for an unregistered module", () => {
    expect(() => buildService().forModule("nope")).toThrow(/Unknown module/);
  });
});
