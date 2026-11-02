import type { MemberStore, MemberVerification } from "@keystone/kernel";

/**
 * In-memory member state used by local mode and module tests.
 *
 * It is a real implementation of the same port as Postgres, not a stub: both
 * writes are upserts that keep the original join time. A restart drops the
 * rows, which is why local mode is logged.
 */
export class InMemoryMemberStore implements MemberStore {
  readonly #members = new Map<string, MemberVerification>();

  #key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  async get(guildId: string, userId: string): Promise<MemberVerification | undefined> {
    const record = this.#members.get(this.#key(guildId, userId));
    return record ? { ...record } : undefined;
  }

  async markQuarantined(
    guildId: string,
    userId: string,
  ): Promise<MemberVerification> {
    const key = this.#key(guildId, userId);
    const existing = this.#members.get(key);
    const now = new Date().toISOString();
    const record: MemberVerification = {
      guildId,
      userId,
      joinedAt: existing?.joinedAt ?? now,
      quarantined: true,
      verifiedAt: undefined,
      updatedAt: now,
    };
    this.#members.set(key, record);
    return { ...record };
  }

  async markVerified(
    guildId: string,
    userId: string,
    verifiedAt: string,
  ): Promise<MemberVerification> {
    const key = this.#key(guildId, userId);
    const existing = this.#members.get(key);
    const now = new Date().toISOString();
    const record: MemberVerification = {
      guildId,
      userId,
      joinedAt: existing?.joinedAt ?? now,
      quarantined: false,
      verifiedAt,
      updatedAt: now,
    };
    this.#members.set(key, record);
    return { ...record };
  }
}
