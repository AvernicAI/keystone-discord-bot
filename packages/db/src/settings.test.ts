import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ModuleRegistry,
  SettingsService,
  defineCommand,
  defineModule,
  type ModuleManifest,
} from "@keystone/kernel";
import { createPgliteDatabase, type PgliteHarness } from "./testing";
import { migrate, migrationStatus } from "./migrator";
import { DrizzleSettingsRepository } from "./settings-repository";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keystone-db-"));
  dirs.push(dir);
  return dir;
}

async function open(dir: string): Promise<PgliteHarness> {
  const harness = await createPgliteDatabase(dir);
  await migrate(harness.runner);
  return harness;
}

function module(id: string): ModuleManifest {
  return defineModule({
    id,
    name: id,
    description: `${id} test module`,
    version: "0.0.1",
    settingsSchema: z.object({ payload: z.unknown() }),
    defaultSettings: { payload: null },
    commands: [
      defineCommand({
        name: id,
        description: `${id} command`,
        async execute() {
          /* no-op */
        },
      }),
    ],
  });
}

function serviceFor(harness: PgliteHarness, ids: string[] = ["levels"]): SettingsService {
  const registry = new ModuleRegistry().registerAll(ids.map(module));
  return new SettingsService(new DrizzleSettingsRepository(harness.db), registry);
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("settings persistence", () => {
  it("survives close and reopen with full JSON value fidelity", async () => {
    const dir = await tempDir();
    const value = {
      nested: { a: 1, b: [true, null, "x"] },
      list: [1, "two", null, { deep: true }, [3, 4]],
      nil: null,
      count: 42,
      ratio: 1.5,
      text: "héllo 🚀 日本語",
      numericString: "123",
      flag: false,
    };

    // Write through the same service a command receives, not raw SQL.
    const first = await open(dir);
    await serviceFor(first).update("guild-1", "levels", { payload: value });
    await first.close();

    // A new engine instance on the same data directory: the restart the exit
    // demo describes, not a reuse of process memory.
    const second = await open(dir);
    const stored = await serviceFor(second).get("guild-1", "levels");
    expect(stored.payload).toEqual(value);
    expect(stored.payload).toStrictEqual(value);
    await second.close();
  });

  it("does not leak one module's keys into another's", async () => {
    const harness = await open(await tempDir());
    const service = serviceFor(harness, ["levels", "tickets"]);

    await service.update("guild-1", "levels", {
      payload: { enabled: true, xpPerMessage: 15 },
    });
    await service.update("guild-1", "tickets", {
      payload: { enabled: false, panelChannel: "123" },
    });
    await service.update("guild-1", "levels", {
      payload: { enabled: false, xpPerMessage: 30 },
    });

    expect((await service.get("guild-1", "levels")).payload).toEqual({
      enabled: false,
      xpPerMessage: 30,
    });
    expect((await service.get("guild-1", "tickets")).payload).toEqual({
      enabled: false,
      panelChannel: "123",
    });
    expect((await service.get("guild-2", "levels")).payload).toBeNull();

    await harness.close();
  });

  it("removes keys the module no longer declares instead of leaving ghosts", async () => {
    const harness = await open(await tempDir());
    const repo = new DrizzleSettingsRepository(harness.db);

    await repo.set("guild-1", "levels", { enabled: true, legacy: "remove me" });
    await repo.set("guild-1", "levels", { enabled: false });

    expect(await repo.get("guild-1", "levels")).toEqual({ enabled: false });
    await harness.close();
  });

  it("is safe to migrate twice", async () => {
    const harness = await open(await tempDir());
    const second = await migrate(harness.runner);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toContain("0001_init");
    expect(second.alreadyApplied).toContain("0002_settings_nullable");
    expect((await migrationStatus(harness.runner)).upToDate).toBe(true);
    await harness.close();
  });
});
