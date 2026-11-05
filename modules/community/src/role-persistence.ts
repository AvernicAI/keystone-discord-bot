import type { CommunityActions, CommunityStore } from "@keystone/kernel";
import type { CommunitySettings } from "./settings";

/** Where a member's role set is stored while they are away. */
const KIND = "role_snapshot";

export interface RoleSnapshot {
  readonly roles: readonly string[];
  readonly savedAt: string;
}

export interface RoleRestoreResult {
  readonly restored: number;
  readonly failed: number;
  /** True when persistence is off or there was no snapshot to apply. */
  readonly skipped: boolean;
}

/**
 * Remembers a member's roles when they leave and reapplies them when they
 * rejoin.
 *
 * This is deliberately separate from `WelcomeService`: a server can want role
 * persistence without a welcome message, and a goodbye failure must not lose the
 * snapshot. The snapshot is one `community_records` row, keyed by user, and it
 * is deleted after the one restore attempt — a role that Discord still refuses
 * (managed, above the bot, or deleted) is reported as failed rather than retried
 * forever on every join.
 *
 * Safety rules:
 * - Off by default. Only `roles.persist: true` writes or restores anything.
 * - At most `roles.persistMax` ids are stored (default 20).
 * - The `@everyone` role is never part of a member's role list anyway; the
 *   caller passes only assigned role ids.
 * - Discord remains the authority: a role the bot cannot manage is refused by
 *   the API and counted as failed. No permission is escalated locally.
 */
export class RolePersistenceService {
  constructor(
    private readonly store: CommunityStore,
    private readonly actions: CommunityActions,
    private readonly settings: CommunitySettings,
    private readonly now: () => number = Date.now,
  ) {}

  /** Store the roles a departing member held. A disabled feature writes nothing. */
  async save(
    guildId: string,
    userId: string,
    roleIds: readonly string[],
  ): Promise<{ saved: number }> {
    if (!this.settings.roles.persist) return { saved: 0 };
    const roles = [...new Set(roleIds.filter(Boolean))].slice(0, this.settings.roles.persistMax);
    if (roles.length === 0) return { saved: 0 };
    await this.store.putRecord<RoleSnapshot>(guildId, KIND, userId, {
      roles,
      savedAt: new Date(this.now()).toISOString(),
    });
    return { saved: roles.length };
  }

  /** Reapply a stored snapshot once, then delete it. */
  async restore(guildId: string, userId: string): Promise<RoleRestoreResult> {
    if (!this.settings.roles.persist) return { restored: 0, failed: 0, skipped: true };
    const record = await this.store.getRecord<RoleSnapshot>(guildId, KIND, userId);
    if (!record) return { restored: 0, failed: 0, skipped: true };

    let restored = 0;
    let failed = 0;
    for (const roleId of record.data.roles) {
      const result = await this.actions.addRole(
        guildId,
        userId,
        roleId,
        "Role persistence restore",
      );
      if (result.ok) restored += 1;
      else failed += 1;
    }
    await this.store.deleteRecord(guildId, KIND, userId);
    return { restored, failed, skipped: false };
  }

  /** Read-only view for tests and operators; the snapshot is not a user surface. */
  async snapshot(guildId: string, userId: string): Promise<RoleSnapshot | undefined> {
    const record = await this.store.getRecord<RoleSnapshot>(guildId, KIND, userId);
    return record?.data;
  }
}
