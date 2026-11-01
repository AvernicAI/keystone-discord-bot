import { describe, expect, it } from "vitest";
import { InviteService, attributeInvite, suspiciousReasons } from "./invites";
import { inviteSettingsSchema } from "./settings";
import { InMemoryInviteStore } from "./store";
import { RecordingInviteActions } from "./testing";

const settings = inviteSettingsSchema.parse({});

function service(options: { enabled?: boolean; logChannelId?: string } = {}) {
  const store = new InMemoryInviteStore();
  const actions = new RecordingInviteActions();
  const config = inviteSettingsSchema.parse(options);
  return {
    store,
    actions,
    service: new InviteService(store, actions, config, () => 1_700_000_000_000),
  };
}

describe("invite attribution", () => {
  it("uses the invite whose use counter increased", () => {
    const attribution = attributeInvite(
      [
        { code: "alpha", uses: 2, inviterId: "inviter-a" },
        { code: "beta", uses: 7, inviterId: "inviter-b" },
      ],
      [
        { code: "alpha", uses: 3, inviterId: "inviter-a" },
        { code: "beta", uses: 7, inviterId: "inviter-b" },
      ],
    );

    expect(attribution).toEqual({
      code: "alpha",
      inviterId: "inviter-a",
      usesBefore: 2,
      usesAfter: 3,
    });
  });

  it("handles a code that did not exist in the cache", () => {
    expect(
      attributeInvite(
        [{ code: "alpha", uses: 2, inviterId: "inviter-a" }],
        [
          { code: "alpha", uses: 2, inviterId: "inviter-a" },
          { code: "new", uses: 1, inviterId: "inviter-b" },
        ],
      )?.code,
    ).toBe("new");
  });

  it("returns undefined when nothing changed or the invite has no inviter", () => {
    expect(attributeInvite([], [])).toBeUndefined();
    expect(
      attributeInvite(
        [{ code: "alpha", uses: 2, inviterId: "inviter-a" }],
        [{ code: "alpha", uses: 2, inviterId: "inviter-a" }],
      ),
    ).toBeUndefined();
    expect(
      attributeInvite([], [{ code: "vanity", uses: 1, inviterId: undefined }]),
    ).toBeUndefined();
  });

  it("is deterministic when two invites changed", () => {
    const before = [
      { code: "b", uses: 0, inviterId: "b" },
      { code: "a", uses: 0, inviterId: "a" },
    ];
    const after = [
      { code: "b", uses: 1, inviterId: "b" },
      { code: "a", uses: 1, inviterId: "a" },
    ];
    expect(attributeInvite(before, after)?.code).toBe("a");
  });
});

describe("suspicious join flags", () => {
  it("flags a brand-new account without an avatar", () => {
    expect(suspiciousReasons({ accountAgeDays: 1, hasAvatar: false }, settings)).toEqual([
      "account-age",
      "no-avatar",
    ]);
  });

  it("leaves an established account alone", () => {
    expect(suspiciousReasons({ accountAgeDays: 100, hasAvatar: true }, settings)).toEqual([]);
  });

  it("can disable either check", () => {
    const off = inviteSettingsSchema.parse({ minAccountAgeDays: 0, flagNoAvatar: false });
    expect(suspiciousReasons({ accountAgeDays: 0, hasAvatar: false }, off)).toEqual([]);
  });
});

describe("InviteService", () => {
  it("records a join once, even if the gateway delivers it twice", async () => {
    const { service: invites } = service();
    const attribution = {
      code: "alpha",
      inviterId: "inviter-a",
      usesBefore: 0,
      usesAfter: 1,
    };

    expect(
      await invites.recordJoin(
        "guild-a",
        { userId: "member-1", joinedAt: "2026-11-01T00:00:00.000Z", accountAgeDays: 40, hasAvatar: true },
        attribution,
      ),
    ).toEqual({ recorded: true, fakeReasons: [] });

    expect(
      (
        await invites.recordJoin(
          "guild-a",
          { userId: "member-1", joinedAt: "2026-11-01T00:00:00.000Z", accountAgeDays: 40, hasAvatar: true },
          attribution,
        )
      ).recorded,
    ).toBe(false);
  });

  it("counts joins, leaves and retention per inviter", async () => {
    const { service: invites } = service();
    const attribution = {
      code: "alpha",
      inviterId: "inviter-a",
      usesBefore: 0,
      usesAfter: 2,
    };

    await invites.recordJoin("guild-a", {
      userId: "member-1",
      joinedAt: "2026-11-01T00:00:00.000Z",
      accountAgeDays: 40,
      hasAvatar: true,
    }, attribution);
    await invites.recordJoin("guild-a", {
      userId: "member-2",
      joinedAt: "2026-11-01T00:01:00.000Z",
      accountAgeDays: 40,
      hasAvatar: true,
    }, attribution);
    await invites.recordLeave("guild-a", "member-2");

    expect(await invites.leaderboard("guild-a")).toEqual([
      { inviterId: "inviter-a", joins: 2, leaves: 1, retained: 1 },
    ]);
    expect(await invites.statsFor("guild-a", "inviter-a")).toMatchObject({ joins: 2, retained: 1 });
    expect(await invites.statsFor("guild-a", "member-2")).toBeUndefined();
  });

  it("notifies the log channel for a flagged join and takes no punitive action", async () => {
    const { service: invites, actions } = service({ logChannelId: "log-channel" });

    await invites.recordJoin("guild-a", {
      userId: "new-account",
      joinedAt: "2026-11-01T00:00:00.000Z",
      accountAgeDays: 0,
      hasAvatar: false,
    });

    expect(actions.notices).toHaveLength(1);
    expect(actions.notices[0]?.channelId).toBe("log-channel");
    expect(actions.notices[0]?.notice.embeds?.[0]?.title).toBe("Suspicious invite join");
    expect(actions.notices[0]?.notice.embeds?.[0]?.footer?.text).toContain("Advisory only");
  });

  it("does nothing when the operator disables tracking", async () => {
    const { service: invites, actions, store } = service({
      enabled: false,
      logChannelId: "log-channel",
    });

    const result = await invites.recordJoin("guild-a", {
      userId: "member-1",
      joinedAt: "2026-11-01T00:00:00.000Z",
      accountAgeDays: 0,
      hasAvatar: false,
    });

    expect(result.recorded).toBe(false);
    expect(actions.notices).toEqual([]);
    expect(await store.leaderboard("guild-a", 10)).toEqual([]);
  });
});
