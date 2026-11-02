import { describe, expect, it } from "vitest";
import type { MemberStore, ModerationActionResult } from "@keystone/kernel";
import { InMemoryMemberStore } from "./members";
import { moderationSettingsSchema } from "./settings";
import { completeVerification } from "./verification";

const NOW = Date.parse("2026-11-01T00:00:00.000Z");

function settings(joinGateEnabled = true) {
  return moderationSettingsSchema.parse({
    joinGate: { enabled: joinGateEnabled, minAccountAgeDays: 7 },
  });
}

function recorder(result: ModerationActionResult = { ok: true }) {
  const calls: { guildId: string; userId: string; reason: string; roleId?: string }[] = [];
  return {
    calls,
    actions: {
      async unquarantine(
        guildId: string,
        userId: string,
        reason: string,
        roleId?: string,
      ): Promise<ModerationActionResult> {
        calls.push({ guildId, userId, reason, roleId });
        return result;
      },
    },
  };
}

function staleStore(): MemberStore {
  return {
    async get() {
      return {
        guildId: "guild-1",
        userId: "user-1",
        quarantined: false,
      };
    },
    async markQuarantined() {
      throw new Error("markQuarantined should not be called");
    },
    async markVerified() {
      throw new Error("markVerified should not be called");
    },
  };
}

describe("completeVerification", () => {
  it("refuses a member with no quarantine record and performs no action", async () => {
    const members = new InMemoryMemberStore();
    const { actions, calls } = recorder();

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(),
      members,
      actions,
      now: () => NOW,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("No quarantine is recorded");
    expect(calls).toHaveLength(0);
    expect(await members.get("guild-1", "user-1")).toBeUndefined();
  });

  it("refuses a persisted record that is not quarantined", async () => {
    const { actions, calls } = recorder();

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(),
      members: staleStore(),
      actions,
      now: () => NOW,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("No quarantine is recorded");
    expect(calls).toHaveLength(0);
  });

  it("transitions a quarantined row only after the action succeeds", async () => {
    const members = new InMemoryMemberStore();
    await members.markQuarantined("guild-1", "user-1");
    const { actions, calls } = recorder();

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(),
      members,
      actions,
      now: () => NOW,
    });

    expect(outcome).toMatchObject({
      ok: true,
      verifiedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(calls).toEqual([
      {
        guildId: "guild-1",
        userId: "user-1",
        reason: "Verification completed",
        roleId: undefined,
      },
    ]);
    expect(await members.get("guild-1", "user-1")).toMatchObject({
      quarantined: false,
      verifiedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("leaves a quarantined row untouched when the quarantine action fails", async () => {
    const members = new InMemoryMemberStore();
    await members.markQuarantined("guild-1", "user-1");
    const { actions, calls } = recorder({ ok: false, detail: "Missing Permissions" });

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(),
      members,
      actions,
      now: () => NOW,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Missing Permissions");
    expect(calls).toHaveLength(1);
    expect(await members.get("guild-1", "user-1")).toMatchObject({
      quarantined: true,
      verifiedAt: undefined,
    });
  });

  it("refuses an already verified row without another action", async () => {
    const members = new InMemoryMemberStore();
    await members.markQuarantined("guild-1", "user-1");
    await members.markVerified("guild-1", "user-1", "2026-10-31T00:00:00.000Z");
    const { actions, calls } = recorder();

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(),
      members,
      actions,
      now: () => NOW,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("already verified");
    expect(calls).toHaveLength(0);
  });

  it("refuses when the join gate is disabled", async () => {
    const members = new InMemoryMemberStore();
    await members.markQuarantined("guild-1", "user-1");
    const { actions, calls } = recorder();

    const outcome = await completeVerification({
      guildId: "guild-1",
      userId: "user-1",
      actorId: "user-1",
      settings: settings(false),
      members,
      actions,
      now: () => NOW,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("join gate is not enabled");
    expect(calls).toHaveLength(0);
  });
});
