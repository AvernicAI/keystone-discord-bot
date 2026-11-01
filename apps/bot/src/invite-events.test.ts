import { EventEmitter } from "node:events";
import { Events, type Client, type GuildMember } from "discord.js";
import {
  createSilentLogger,
  type InvitePort,
  type InviteStore,
  type ModuleSettings,
} from "@keystone/kernel";
import { describe, expect, it, vi } from "vitest";
import { registerInviteEvents } from "./invite-events";

const GUILD = "1450130465146142785";
const MEMBER = "444444444444444444";

function harness(invites: readonly { code: string; uses: number; inviterId?: string }[]) {
  const client = new EventEmitter() as unknown as Client;
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
  const port: InvitePort = {
    store,
    actions: { notify: vi.fn(async () => undefined) },
  };
  const guild = {
    id: GUILD,
    invites: {
      fetch: vi.fn(
        async () =>
          new Map(
            invites.map((invite) => [
              invite.code,
              {
                code: invite.code,
                uses: invite.uses,
                inviter: invite.inviterId ? { id: invite.inviterId } : null,
              },
            ]),
          ),
      ),
    },
  };
  const member = {
    id: MEMBER,
    joinedTimestamp: 1_700_000_000_000,
    guild,
    user: {
      bot: false,
      createdTimestamp: 1_600_000_000_000,
      avatar: "avatar-hash",
    },
  } as unknown as GuildMember;
  return { client, recordJoin, port, settings, member };
}

function emitJoin(client: Client, member: GuildMember): void {
  (client as unknown as EventEmitter).emit(Events.GuildMemberAdd, member);
}

describe("invite gateway events", () => {
  it("records a join without an inviter when the cache has no baseline", async () => {
    const test = harness([
      { code: "popular", uses: 50, inviterId: "inviter-a" },
      { code: "used", uses: 1, inviterId: "inviter-b" },
    ]);
    registerInviteEvents(test.client, test.port, test.settings, createSilentLogger());

    emitJoin(test.client, test.member);

    await vi.waitFor(() => expect(test.recordJoin).toHaveBeenCalledTimes(1));
    expect(test.recordJoin).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: GUILD,
        userId: MEMBER,
        inviterId: undefined,
        code: undefined,
      }),
    );
  });
});
