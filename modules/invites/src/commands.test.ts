import { describe, expect, it } from "vitest";
import { ModuleRegistry, auditBudget } from "@keystone/kernel";
import { FakeInteraction, createTestContext } from "@keystone/testing";
import { invitesModule } from "./manifest";
import { invites } from "./commands/invites";
import { inviteSettingsSchema } from "./settings";
import { InMemoryInviteStore } from "./store";
import { RecordingInviteActions } from "./testing";

async function context(options: Record<string, string | number | boolean | null> = {}) {
  const store = new InMemoryInviteStore();
  await store.recordJoin({
    guildId: "guild-a",
    userId: "member-1",
    inviterId: "inviter-a",
    code: "alpha",
    joinedAt: "2026-11-01T00:00:00.000Z",
    fakeReasons: ["no-avatar"],
  });
  const actions = new RecordingInviteActions();
  const interaction = new FakeInteraction({
    commandName: "invites",
    guildId: "guild-a",
    userId: "member-1",
    options,
  });
  const ctx = createTestContext({
    interaction,
    moduleId: "invites",
    settings: inviteSettingsSchema.parse({}),
    invites: { store, actions },
  });
  return { ctx, interaction, store, actions };
}

describe("invite command", () => {
  it("is one root inside the global budget", () => {
    const registry = new ModuleRegistry().register(invitesModule);
    expect(registry.commandNames()).toEqual(["invites"]);
    expect(auditBudget(registry).commands).toBe(1);
    expect(registry.intents()).toContain("GuildInvites");
    expect(registry.capabilityReport("minimal").disabledFeatures).toContain(
      "GuildMembers: invites — invite attribution and leave retention are disabled; existing records stay readable",
    );
  });

  it("renders the invite leaderboard", async () => {
    const { ctx, interaction } = await context({ action: "leaderboard" });
    await invites.execute(ctx);
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("<@inviter-a> — 1 joined · 1 retained");
  });

  it("renders a member's invite totals", async () => {
    const { ctx, interaction } = await context({ action: "stats", user: "inviter-a" });
    await invites.execute(ctx);
    expect(interaction.lastReply?.embeds?.[0]?.description).toContain("**1** joined");
  });

  it("answers who invited a member, including the flag", async () => {
    const { ctx, interaction } = await context({ action: "who", user: "member-1" });
    await invites.execute(ctx);
    expect(interaction.lastReply?.content).toContain("invited by <@inviter-a>");
    expect(interaction.lastReply?.content).toContain("no-avatar");
  });

  it("says so when no attribution exists", async () => {
    const { ctx, interaction } = await context({ action: "who", user: "stranger" });
    await invites.execute(ctx);
    expect(interaction.lastReply?.content).toContain("No invite attribution");
  });

  it("refuses clearly when the composition root did not wire the port", async () => {
    const interaction = new FakeInteraction({ commandName: "invites", guildId: "guild-a" });
    const ctx = createTestContext({ interaction, moduleId: "invites" });
    await expect(invites.execute(ctx)).rejects.toThrow(/not wired/i);
  });
});
