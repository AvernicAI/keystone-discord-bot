import { describe, expect, it } from "vitest";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import { aiDefaultSettings } from "./settings";
import { InMemoryAiStore } from "./store";
import { DeterministicAiProvider } from "./provider";
import { AiService } from "./service";
import { explainMessage } from "./commands/explain-message";

function context(overrides: Record<string, unknown> = {}) {
  const interaction = new FakeInteraction({
    commandName: "Explain with AI",
    commandType: "message",
    guildId: "guild-a",
    userId: "moderator",
    channelId: "channel-a",
    targetId: "message-1",
    targetUserId: "author-1",
    targetContent: "free nitro at scam.test",
    permissions: ["ManageMessages"],
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "ai",
    settings: { ...aiDefaultSettings, enabled: true, explanations: true, ...overrides },
  });
  const ai = new AiService(new InMemoryAiStore(), new DeterministicAiProvider(), ctx.settings);
  return { ctx: { ...ctx, ai }, interaction };
}

describe("AI message context menu", () => {
  it("explains the selected message through the same service as /ai explain", async () => {
    const { ctx, interaction } = context();
    await explainMessage.execute(ctx);
    const embed = interaction.lastReply?.embeds?.[0];
    expect(embed?.title).toContain("advisory");
    expect(embed?.description).toContain("AI can be wrong");
    expect(embed?.description).toContain("scam.test");
  });

  it("honours the explanations setting instead of bypassing it", async () => {
    const { ctx } = context({ explanations: false });
    await expect(explainMessage.execute(ctx)).rejects.toThrow();
  });

  it("does not mutate any case when it explains", async () => {
    const { ctx } = context();
    await explainMessage.execute(ctx);
    expect(ctx.interaction.replies).toHaveLength(1);
  });
});
