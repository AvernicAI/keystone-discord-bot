import { describe, expect, it } from "vitest";
import type { ModerationActions } from "@keystone/kernel";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import { CaseService, InMemoryCaseStore } from "./cases";
import { reportMessage } from "./commands/report-message";
import { caseHistory } from "./commands/case-history";

const actions = {} as ModerationActions;

function buildReport(target: Partial<ConstructorParameters<typeof FakeInteraction>[0]> = {}) {
  const cases = new CaseService(new InMemoryCaseStore());
  const interaction = new FakeInteraction({
    commandName: "Report message",
    commandType: "message",
    guildId: "guild-a",
    userId: "reporter",
    channelId: "channel-a",
    targetId: "message-1",
    targetUserId: "author-1",
    targetContent: "buy followers at spam.test",
    ...target,
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "moderation",
    settings: {},
    moderation: { cases, actions },
  });
  return { cases, interaction, ctx };
}

describe("moderation context menus", () => {
  it("Report message opens a real case with the target message id", async () => {
    const { cases, interaction, ctx } = buildReport();
    await reportMessage.execute(ctx);

    const records = await cases.list("guild-a", { targetId: "author-1" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: "report",
      rule: "message-report",
      actorId: "reporter",
      targetId: "author-1",
      state: "open",
    });
    expect(records[0]?.evidence).toMatchObject({
      messageId: "message-1",
      channelId: "channel-a",
    });
    expect(records[0]?.reason).toContain("spam.test");
    expect(interaction.lastReply?.embeds?.[0]?.title).toContain("case #1");
  });

  it("Report message records an honest placeholder without MessageContent", async () => {
    const { cases, ctx } = buildReport({ targetContent: "" });
    await reportMessage.execute(ctx);
    const [record] = await cases.list("guild-a", { targetId: "author-1" });
    expect(record?.reason).toContain("MessageContent intent is off");
    expect(record?.evidence).toMatchObject({ messageId: "message-1" });
  });

  it("Report message refuses a self-report", async () => {
    const { ctx } = buildReport({ targetUserId: "reporter" });
    await expect(reportMessage.execute(ctx)).rejects.toThrow(/your own message/i);
  });

  it("Case history reads the same rows for the selected member", async () => {
    const cases = new CaseService(new InMemoryCaseStore());
    await cases.open({
      guildId: "guild-a",
      actorId: "moderator",
      targetId: "author-1",
      action: "warn",
      reason: "spam",
    });
    const interaction = new FakeInteraction({
      commandName: "Case history",
      commandType: "user",
      guildId: "guild-a",
      userId: "moderator",
      targetId: "author-1",
      permissions: ["ModerateMembers"],
    });
    const ctx = createTestContext({
      interaction,
      moduleId: "moderation",
      settings: {},
      moderation: { cases, actions },
    });
    await caseHistory.execute(ctx);
    expect(interaction.lastReply?.embeds?.[0]?.title).toContain("<@author-1>");
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("spam");
  });
});
