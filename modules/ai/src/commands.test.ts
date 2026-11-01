import { describe, expect, it } from "vitest";
import {
  CaseService,
  InMemoryCaseStore,
} from "@keystone/module-moderation";
import { aiDefaultSettings } from "./settings";
import { InMemoryAiStore } from "./store";
import { DeterministicAiProvider } from "./provider";
import { AiService } from "./service";
import { aiModule } from "./manifest";
import { ai } from "./commands/ai";
import { FakeInteraction, createTestContext } from "@keystone/testing";
import { ModuleRegistry, auditBudget, type CommandContext } from "@keystone/kernel";

type Options = Record<string, string | number | boolean | null>;

function context(options: Options, permissions: string[] = [], overrides: Record<string, unknown> = {}) {
  const interaction = new FakeInteraction({
    commandName: "ai",
    guildId: "guild-a",
    userId: "user-a",
    permissions,
    options,
    subcommand: typeof options.action === "string" ? options.action : undefined,
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "ai",
    settings: { ...aiDefaultSettings, enabled: true, ...overrides },
  });
  const service = new AiService(new InMemoryAiStore(), new DeterministicAiProvider(), ctx.settings);
  return { ctx: { ...ctx, ai: service }, interaction, service };
}

async function execute(ctx: CommandContext): Promise<void> {
  await ai.execute(ctx);
}

describe("ai commands", () => {
  it("registers one root and stays inside the global budget", () => {
    const registry = new ModuleRegistry().register(aiModule);
    expect(registry.commandNames()).toEqual(["ai"]);
    expect(auditBudget(registry).commands).toBe(1);
    expect(auditBudget(registry).status).toBe("ok");
  });

  it("reports disabled status without throwing, so disabling AI breaks no command", async () => {
    const { ctx, interaction } = context({ action: "status" }, [], { enabled: false });
    await execute(ctx);
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("off");
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("Retention: **none**");
  });

  it("requires ManageGuild to add docs and exposes the admin path", async () => {
    const missing = context({ action: "docs-add", name: "Rules", value: "Be kind." });
    await expect(execute(missing.ctx)).rejects.toThrow(/ManageGuild/i);

    const { ctx, interaction, service } = context(
      { action: "docs-add", name: "Rules", value: "Be kind and follow the server rules." },
      ["ManageGuild"],
    );
    await execute(ctx);
    expect(interaction.lastReply?.content).toContain("Rules");
    expect((await service.listDocuments("guild-a")).map((doc) => doc.name)).toEqual(["Rules"]);
  });

  it("updates the hard budget through the admin path", async () => {
    const { ctx, interaction } = context(
      { action: "budget", value: "2.50", limit: 20 },
      ["ManageGuild"],
    );
    await execute(ctx);
    expect(await ctx.settings.get("guild-a")).toMatchObject({
      monthlyBudgetUsd: 2.5,
      monthlyRequests: 20,
    });
    expect(interaction.lastReply?.content).toContain("$2.50");
  });

  it("answers a server-docs question and cites the document", async () => {
    const { ctx, service, interaction } = context(
      { action: "docs-add", name: "Refunds", value: "Refunds are available within 14 days." },
      ["ManageGuild"],
    );
    await execute(ctx);
    const ask = context(
      { action: "ask", question: "refund" },
      [],
      { enabled: true },
    );
    await execute({ ...ask.ctx, ai: service });
    expect(ask.interaction.lastReply?.embeds?.[0]?.description).toContain("Refunds");
    expect(ask.interaction.lastReply?.embeds?.[0]?.description).toContain("Sources: Refunds");
    expect(interaction.lastReply?.content).toContain("Refunds");
  });

  it("explains a moderation case from the case service and leaves it untouched", async () => {
    const cases = new CaseService(new InMemoryCaseStore());
    const record = await cases.open({
      guildId: "guild-a",
      actorId: "mod-a",
      targetId: "user-b",
      action: "warn",
      reason: "posted a duplicate invite",
      rule: "duplicate",
    });
    const { ctx, interaction } = context(
      { action: "explain", case: record.caseNumber },
      ["ManageGuild"],
      { enabled: true, explanations: true },
    );
    await execute({ ...ctx, moderation: { cases, actions: {} as never } });
    expect(interaction.lastReply?.embeds?.[0]?.title).toContain(`Case #${record.caseNumber}`);
    expect((await cases.get("guild-a", record.caseNumber))?.state).toBe("open");
  });

  it("rejects a missing case and missing AI services", async () => {
    const { ctx } = context({ action: "explain", case: 99 }, ["ManageGuild"]);
    await expect(execute(ctx)).rejects.toThrow(/not wired|does not exist/i);
  });
});
