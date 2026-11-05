import { describe, expect, it } from "vitest";
import { InMemoryCommunityStore } from "./store";
import { RecordingCommunityActions } from "./testing";
import { communitySettingsSchema } from "./settings";
import { RolePersistenceService } from "./role-persistence";

const guild = "guild-a";
const user = "user-a";

function service(persist: boolean, persistMax = 20) {
  const store = new InMemoryCommunityStore();
  const actions = new RecordingCommunityActions();
  const settings = communitySettingsSchema.parse({ roles: { persist, persistMax } });
  return { store, actions, role: new RolePersistenceService(store, actions, settings) };
}

describe("role persistence", () => {
  it("writes nothing and restores nothing while disabled", async () => {
    const { actions, role } = service(false);
    expect(await role.save(guild, user, ["role-a", "role-b"])).toEqual({ saved: 0 });
    expect(await role.snapshot(guild, user)).toBeUndefined();
    expect(await role.restore(guild, user)).toEqual({ restored: 0, failed: 0, skipped: true });
    expect(actions.roleCalls).toHaveLength(0);
  });

  it("dedupes and caps the snapshot, then restores each role once", async () => {
    const { actions, role } = service(true, 2);
    expect(await role.save(guild, user, ["role-a", "role-a", "role-b", "role-c"])).toEqual({
      saved: 2,
    });
    expect(await role.snapshot(guild, user)).toMatchObject({ roles: ["role-a", "role-b"] });

    expect(await role.restore(guild, user)).toEqual({ restored: 2, failed: 0, skipped: false });
    expect(actions.roleCalls).toEqual([
      { userId: user, roleId: "role-a", added: true },
      { userId: user, roleId: "role-b", added: true },
    ]);

    // The snapshot is consumed: a second join cannot replay stale roles.
    expect(await role.restore(guild, user)).toEqual({ restored: 0, failed: 0, skipped: true });
    expect(actions.roleCalls).toHaveLength(2);
  });

  it("counts a role Discord refuses and still consumes the snapshot", async () => {
    const { actions, role } = service(true);
    actions.refusedRoles.add("role-managed");
    await role.save(guild, user, ["role-ok", "role-managed"]);

    expect(await role.restore(guild, user)).toEqual({ restored: 1, failed: 1, skipped: false });
    expect(await role.snapshot(guild, user)).toBeUndefined();
  });

  it("keeps a clean snapshot when a member leaves with no roles", async () => {
    const { role } = service(true);
    expect(await role.save(guild, user, [])).toEqual({ saved: 0 });
    expect(await role.snapshot(guild, user)).toBeUndefined();
  });
});
