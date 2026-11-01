import type {
  InviteJoinInput,
  InviteJoinRecord,
  InviteLeaderboardRow,
  InviteStore,
} from "@keystone/kernel";

/**
 * In-memory invite store.
 *
 * A duplicate gateway delivery must not double-count a join, exactly like the
 * Postgres unique key. Tests use this store; production swaps the adapter.
 */
export class InMemoryInviteStore implements InviteStore {
  readonly #joins: InviteJoinRecord[] = [];
  readonly #keys = new Set<string>();

  async recordJoin(input: InviteJoinInput): Promise<boolean> {
    const key = `${input.guildId}:${input.userId}:${input.joinedAt}`;
    if (this.#keys.has(key)) return false;
    this.#keys.add(key);
    this.#joins.push({
      guildId: input.guildId,
      userId: input.userId,
      inviterId: input.inviterId,
      code: input.code,
      joinedAt: input.joinedAt,
      fakeReasons: [...(input.fakeReasons ?? [])],
    });
    return true;
  }

  async recordLeave(guildId: string, userId: string, leftAt: string): Promise<boolean> {
    for (let index = this.#joins.length - 1; index >= 0; index -= 1) {
      const join = this.#joins[index];
      if (!join || join.guildId !== guildId || join.userId !== userId || join.leftAt) continue;
      this.#joins[index] = { ...join, leftAt };
      return true;
    }
    return false;
  }

  async leaderboard(guildId: string, limit: number): Promise<InviteLeaderboardRow[]> {
    const totals = new Map<string, { joins: number; leaves: number }>();
    for (const join of this.#joins) {
      if (join.guildId !== guildId || !join.inviterId) continue;
      const row = totals.get(join.inviterId) ?? { joins: 0, leaves: 0 };
      row.joins += 1;
      if (join.leftAt) row.leaves += 1;
      totals.set(join.inviterId, row);
    }

    return [...totals.entries()]
      .map(([inviterId, row]) => ({
        inviterId,
        joins: row.joins,
        leaves: row.leaves,
        retained: row.joins - row.leaves,
      }))
      .sort((a, b) => b.retained - a.retained || b.joins - a.joins || a.inviterId.localeCompare(b.inviterId))
      .slice(0, Math.min(Math.max(limit, 1), 25));
  }

  async statsFor(guildId: string, inviterId: string): Promise<InviteLeaderboardRow | undefined> {
    const joins = this.#joins.filter((join) => join.guildId === guildId && join.inviterId === inviterId);
    if (joins.length === 0) return undefined;
    const leaves = joins.filter((join) => join.leftAt).length;
    return { inviterId, joins: joins.length, leaves, retained: joins.length - leaves };
  }

  async invitee(guildId: string, userId: string): Promise<InviteJoinRecord | undefined> {
    return this.#joins
      .filter(
        (join) => join.guildId === guildId && join.userId === userId && join.inviterId !== undefined,
      )
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))[0];
  }

  /** Read-only helper for the in-memory analytics adapter; not part of the port. */
  records(guildId: string): readonly InviteJoinRecord[] {
    return this.#joins.filter((join) => join.guildId === guildId).map((join) => ({ ...join }));
  }
}
