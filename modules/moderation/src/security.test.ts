import { describe, expect, it } from "vitest";
import {
  createSilentLogger,
  type ModerationActions,
  type ModerationActionResult,
  type ModerationNotice,
} from "@keystone/kernel";
import { createTestSettings } from "@keystone/testing";
import { CaseService, InMemoryCaseStore } from "./cases";
import { SecurityCoordinator, SecurityEngine } from "./security";
import { moderationSettingsSchema } from "./settings";
import { buildNativeAutoModPlan } from "./native-automod";

class RecordingActions implements ModerationActions {
  readonly calls: string[] = [];
  readonly notifications: {
    guildId: string;
    channelId: string | null | undefined;
    notice: ModerationNotice;
  }[] = [];

  private ok(): Promise<ModerationActionResult> {
    return Promise.resolve({ ok: true });
  }

  ban(): Promise<ModerationActionResult> {
    this.calls.push("ban");
    return this.ok();
  }

  kick(): Promise<ModerationActionResult> {
    this.calls.push("kick");
    return this.ok();
  }

  timeout(): Promise<ModerationActionResult> {
    this.calls.push("timeout");
    return this.ok();
  }

  purge(): Promise<ModerationActionResult> {
    this.calls.push("purge");
    return this.ok();
  }

  lock(): Promise<ModerationActionResult> {
    this.calls.push("lock");
    return this.ok();
  }

  slowmode(): Promise<ModerationActionResult> {
    this.calls.push("slowmode");
    return this.ok();
  }

  deleteMessage(): Promise<ModerationActionResult> {
    this.calls.push("delete-message");
    return this.ok();
  }

  deleteWebhook(): Promise<ModerationActionResult> {
    this.calls.push("delete-webhook");
    return this.ok();
  }

  quarantine(): Promise<ModerationActionResult> {
    this.calls.push("quarantine");
    return this.ok();
  }

  unquarantine(): Promise<ModerationActionResult> {
    this.calls.push("unquarantine");
    return this.ok();
  }

  async notify(
    guildId: string,
    channelId: string | null | undefined,
    notice: ModerationNotice,
  ): Promise<void> {
    this.notifications.push({ guildId, channelId, notice });
  }
}

function coordinator(
  settings: Record<string, unknown>,
): { coordinator: SecurityCoordinator; actions: RecordingActions; cases: CaseService; store: InMemoryCaseStore } {
  const store = new InMemoryCaseStore();
  const cases = new CaseService(store);
  const actions = new RecordingActions();
  return {
    store,
    cases,
    actions,
    coordinator: new SecurityCoordinator({
      engine: new SecurityEngine(),
      cases,
      actions,
      settings: createTestSettings(settings),
      logger: createSilentLogger(),
      now: () => 1_000,
    }),
  };
}

const ENFORCING = {
  dryRun: false,
  modLogChannelId: "mod-log",
  quarantineRoleId: "role-quarantine",
  automod: { invites: "timeout" },
};

describe("scripted raid", () => {
  it("contains 10 joins, 5 invite posts and one webhook, with a case for every action", async () => {
    const { coordinator: security, actions, cases } = coordinator(ENFORCING);

    for (let index = 0; index < 10; index += 1) {
      await security.handle({
        type: "member.join",
        guildId: "guild-raid",
        userId: `joiner-${index}`,
        accountAgeDays: 1,
        hasAvatar: false,
        at: 1_000 + index,
      });
    }
    for (let index = 0; index < 5; index += 1) {
      await security.handle({
        type: "message.create",
        guildId: "guild-raid",
        channelId: "general",
        messageId: `message-${index}`,
        userId: "inviter",
        content: `join discord.gg/raid-${index}`,
        at: 2_000 + index,
      });
    }
    await security.handle({
      type: "webhook.create",
      guildId: "guild-raid",
      channelId: "general",
      webhookId: "webhook-1",
      userId: "attacker",
      at: 3_000,
    });

    // The raid is contained: every joining account was quarantined.
    expect(actions.calls.filter((call) => call === "quarantine")).toHaveLength(11);
    expect(actions.calls.filter((call) => call === "delete-message")).toHaveLength(5);
    expect(actions.calls.filter((call) => call === "delete-webhook")).toHaveLength(1);
    expect(actions.calls.filter((call) => call === "timeout")).toHaveLength(1);

    const records = await cases.list("guild-raid", { limit: 100 });
    expect(records.length).toBe(20);
    expect(new Set(records.map((record) => record.caseNumber)).size).toBe(records.length);
    expect(records.every((record) => record.reason.length > 0)).toBe(true);
    expect(records.every((record) => record.caseNumber > 0)).toBe(true);

    // Every alert/action has the same appeal affordance.
    expect(actions.notifications).toHaveLength(20);
    expect(
      actions.notifications.every((notification) => {
        const row = notification.notice.components?.[0];
        return row?.components[0]?.customId.startsWith("keystone:appeal:") === true;
      }),
    ).toBe(true);
  });

  it("takes no punitive action in the default dry-run, but records alerts", async () => {
    const { coordinator: security, actions, cases } = coordinator({});

    for (let index = 0; index < 10; index += 1) {
      await security.handle({
        type: "member.join",
        guildId: "guild-dry",
        userId: `joiner-${index}`,
        accountAgeDays: 1,
        hasAvatar: false,
        at: 1_000 + index,
      });
    }

    expect(actions.calls).toEqual([]);
    expect(actions.notifications.length).toBeGreaterThan(0);
    const records = await cases.list("guild-dry", { limit: 100 });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.state === "alerted")).toBe(true);
  });

  it("does not mistake a single join for a raid", () => {
    const engine = new SecurityEngine();
    const settings = moderationSettingsSchema.parse({ antiRaid: { joinsPerWindow: 10 } });
    const findings = engine.evaluate(
      {
        type: "member.join",
        guildId: "guild-calm",
        userId: "one",
        accountAgeDays: 100,
        hasAvatar: true,
      },
      settings,
      1_000,
    );
    expect(findings).toEqual([]);
  });
});

describe("native AutoMod plan", () => {
  it("only manages prefixed rules and includes an alert action when a log channel is set", () => {
    const settings = moderationSettingsSchema.parse({
      nativeAutoMod: { sync: true },
      modLogChannelId: "mod-log",
    });
    const plan = buildNativeAutoModPlan(settings);

    expect(plan).toHaveLength(2);
    expect(plan.every((rule) => rule.name.startsWith("Keystone ·"))).toBe(true);
    expect(plan[0]?.actions.map((action) => action.type)).toEqual([
      "BLOCK_MESSAGE",
      "SEND_ALERT_MESSAGE",
    ]);
  });

  it("does nothing until the operator explicitly enables sync", () => {
    expect(buildNativeAutoModPlan(moderationSettingsSchema.parse({}))).toEqual([]);
  });
});
