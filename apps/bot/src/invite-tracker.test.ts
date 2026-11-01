import {
  createSilentLogger,
  type InviteStore,
  type ModuleSettings,
} from "@keystone/kernel";
import { describe, expect, it, vi } from "vitest";
import { createInviteTracker } from "./invite-tracker";

const GUILD = "1450130465146142785";

describe("invite tracker", () => {
  it("serializes joins per guild so the second join sees the first cache update", async () => {
    let releaseFirstFetch!: () => void;
    const firstFetch = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    let fetchCount = 0;
    const fetchInvites = vi.fn(async () => {
      fetchCount += 1;
      if (fetchCount === 1) await firstFetch;
      return new Map([
        ["partner", { code: "partner", uses: fetchCount, inviterId: "inviter" }],
      ]);
    });
    const recordJoin = vi.fn(async () => true);
    const store: InviteStore = {
      recordJoin,
      recordLeave: vi.fn(async () => true),
      leaderboard: vi.fn(async () => []),
      statsFor: vi.fn(async () => undefined),
      invitee: vi.fn(async () => undefined),
    };
    const settings: ModuleSettings = {
      get: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    };
    const tracker = createInviteTracker({
      port: { store, actions: { notify: vi.fn(async () => undefined) } },
      settings,
      logger: createSilentLogger(),
    });
    const join = (userId: string) =>
      tracker.join({
        guildId: GUILD,
        userId,
        joinedAt: "2026-11-01T00:00:00.000Z",
        accountAgeDays: 30,
        hasAvatar: true,
        fetchInvites,
      });

    const first = join("111111111111111111");
    const second = join("222222222222222222");

    await vi.waitFor(() => expect(fetchCount).toBe(1));
    expect(recordJoin).not.toHaveBeenCalled();

    releaseFirstFetch();
    await Promise.all([first, second]);

    expect(fetchCount).toBe(2);
    expect(recordJoin).toHaveBeenCalledTimes(2);
    expect(recordJoin).toHaveBeenLastCalledWith(
      expect.objectContaining({
        guildId: GUILD,
        userId: "222222222222222222",
        inviterId: "inviter",
      }),
    );
  });
});
