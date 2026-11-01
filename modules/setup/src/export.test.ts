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
  type ExportLiveFacts,
  type ExportPort,
} from "@keystone/kernel";
import { FakeInteraction, createTestContext, noopQueue, staticHealth } from "@keystone/testing";
import { setupModule } from "./manifest";
import { exportCommand } from "./commands/export";

const guildExport = {
  guildId: "guild-1",
  fileName: "keystone-guild-1-2026-11-01.json",
  content: '{"manifest":{"format":"keystone.export"}}\n',
  checksum: "a".repeat(64),
  counts: { settings: 2, cases: 1, levels: 3 },
  warnings: ["Treat this file as private."],
};

function fakePort(): ExportPort & {
  calls: string[];
  lastImport?: { guildId: string; text: string; options: ExportImportOptions };
  lastDrift?: ExportLiveFacts;
} {
  const calls: string[] = [];
  const port = {
    calls,
    lastImport: undefined as
      | { guildId: string; text: string; options: ExportImportOptions }
      | undefined,
    lastDrift: undefined as ExportLiveFacts | undefined,
    async guild() {
      calls.push("guild");
      return guildExport;
    },
    async user(_guildId: string, userId: string) {
      calls.push(`user:${userId}`);
      return {
        guildId: "guild-1",
        userId,
        fileName: `keystone-user-${userId}.json`,
        content: '{"format":"keystone.user-export"}\n',
        counts: { cases: 1, levels: 1 },
        warnings: ["Private."],
      };
    },
    async importBundle(guildId: string, text: string, options: ExportImportOptions) {
      calls.push("import");
      port.lastImport = { guildId, text, options };
      return {
        state: options.dryRun ? "dry-run" : "applied",
        importId: "import-1",
        checksum: "b".repeat(64),
        counts: { settings: 2 },
        diff: { added: 1, changed: 1, removed: 0 },
        warnings: ["Merge is narrow."],
        verified: true,
      } as const;
    },
    async deleteGuild(guildId: string) {
      calls.push("delete");
      return {
        importId: "delete-1",
        guildId,
        counts: { cases: 1, settings: 2 },
        checksum: "c".repeat(64),
        deletedAt: "2026-11-01T00:00:00.000Z",
      };
    },
    async drift(_guildId: string, live: ExportLiveFacts) {
      calls.push("drift");
      port.lastDrift = live;
      return {
        refs: 2,
        missing: [{ kind: "channel" as const, id: "404", path: "logging.channelId", reason: "missing" as const }],
        permissionGaps: [],
        expectedAutoModRules: [],
        missingAutoModRules: [],
        readOnly: true as const,
      };
    },
    async rollback(importId: string) {
      calls.push("rollback");
      return {
        importId,
        guildId: "guild-1",
        state: "rolled-back",
        rolledBackAt: "2026-11-01T00:00:00.000Z",
      };
    },
  };
  return port;
}

function context(
  subcommand: string,
  options: Record<string, string | number | boolean | null> = {},
  overrides: Partial<Parameters<typeof createTestContext>[0]> = {},
) {
  const interaction = new FakeInteraction({
    commandName: "export",
    guildId: "guild-1",
    userId: "actor-1",
    subcommand,
    options,
  });
  const port = fakePort();
  const ctx = createTestContext({
    interaction,
    moduleId: "setup",
    export: port,
    exportFacts: async (guildId) => ({
      channels: [guildId === "guild-1" ? "known" : "other"],
      roles: [],
      categories: [],
      automodRules: [],
    }),
    attachments: {
      async read() {
        return '{"manifest":{"format":"keystone.export"}}';
      },
    },
    ...overrides,
  });
  return { ctx, interaction, port };
}

describe("/export command", () => {
  it("registers one root with six subcommands inside the budget", () => {
    const registry = new ModuleRegistry().register(setupModule);
    const command = registry.getCommand("export");
    expect(command?.moduleId).toBe("setup");
    expect(command?.definition.subcommands?.map((entry) => entry.name)).toEqual([
      "guild",
      "user",
      "import",
      "delete",
      "drift",
      "rollback",
    ]);
    expect(auditBudget(registry).commands).toBe(3);
    expect(auditBudget(registry).status).toBe("ok");
  });

  it("blocks a caller without ManageGuild before calling the port", async () => {
    const registry = new ModuleRegistry().register(setupModule);
    const port = fakePort();
    const settings = new SettingsService(new InMemorySettingsRepository(), registry);
    const interaction = new FakeInteraction({
      commandName: "export",
      guildId: "guild-1",
      subcommand: "guild",
      permissions: ["SendMessages"],
    });

    const outcome = await dispatchCommand(
      {
        registry,
        settings,
        export: port,
        logger: createSilentLogger(),
        cooldowns: new InMemoryCooldownStore(),
        queue: noopQueue,
        health: staticHealth(),
      },
      interaction,
    );

    expect(outcome.status).toBe("blocked");
    expect(interaction.lastReply?.content).toContain("ManageGuild");
    expect(port.calls).toEqual([]);
  });

  it("returns the guild bundle as a file with its checksum and counts", async () => {
    const { ctx, interaction } = context("guild");
    await exportCommand.execute(ctx);

    expect(interaction.lastReply?.content).toContain("3 levels");
    expect(interaction.lastReply?.files?.[0]?.name).toBe(guildExport.fileName);
    expect(interaction.lastReply?.files?.[0]?.content).toBe(guildExport.content);
    expect(interaction.lastReply?.embeds?.[0]?.fields?.find((field) => field.name === "Checksum")?.value).toContain(
      guildExport.checksum,
    );
  });

  it("passes the selected member to a user export", async () => {
    const { ctx, interaction, port } = context("user", { user: "target-9" });
    await exportCommand.execute(ctx);

    expect(port.calls).toEqual(["user:target-9"]);
    expect(interaction.lastReply?.content).toContain("<@target-9>");
    expect(interaction.lastReply?.files?.[0]?.name).toContain("target-9");
  });

  it("previews an attached bundle by default and writes only when dry_run is false", async () => {
    const url = "https://cdn.discordapp.com/attachments/1/2/bundle.json";
    const preview = context("import", { bundle: url });
    await exportCommand.execute(preview.ctx);

    expect(preview.port.lastImport).toMatchObject({
      guildId: "guild-1",
      text: '{"manifest":{"format":"keystone.export"}}',
      options: { mode: "replace", dryRun: true, actorId: "actor-1" },
    });
    expect(preview.interaction.lastReply?.content).toContain("nothing written");

    const applied = context("import", { bundle: url, mode: "merge", dry_run: false });
    await exportCommand.execute(applied.ctx);

    expect(applied.port.lastImport?.options).toMatchObject({ mode: "merge", dryRun: false });
    expect(applied.interaction.lastReply?.content).toContain("Import applied");
    expect(applied.interaction.lastReply?.content).toContain("import-1");
  });

  it("refuses deletion unless the exact guild id is typed", async () => {
    const wrong = context("delete", { confirm: "guild-2" });
    await expect(exportCommand.execute(wrong.ctx)).rejects.toThrow(/Refusing to delete/);
    expect(wrong.port.calls).toEqual([]);

    const right = context("delete", { confirm: "guild-1" });
    await exportCommand.execute(right.ctx);
    expect(right.port.calls).toEqual(["delete"]);
    expect(right.interaction.lastReply?.content).toContain("delete-1");
  });

  it("feeds live Discord facts into a read-only drift report", async () => {
    const { ctx, interaction, port } = context("drift");
    await exportCommand.execute(ctx);

    expect(port.calls).toEqual(["drift"]);
    expect(port.lastDrift?.channels).toEqual(["known"]);
    expect(interaction.lastReply?.content).toContain("1 missing");
    expect(interaction.lastReply?.embeds?.[0]?.footer?.text).toContain("never writes");
  });

  it("rolls back by import id and reports the resulting state", async () => {
    const { ctx, interaction, port } = context("rollback", { import_id: "import-7" });
    await exportCommand.execute(ctx);

    expect(port.calls).toEqual(["rollback"]);
    expect(interaction.lastReply?.content).toContain("rolled-back");
    expect(interaction.lastReply?.embeds?.[0]?.fields?.[0]?.value).toBe("guild-1");
  });
});
