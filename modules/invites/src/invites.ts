import type {
  InviteActions,
  InviteAttribution,
  InviteJoinRecord,
  InviteLeaderboardRow,
  InviteSource,
  InviteStore,
} from "@keystone/kernel";
import type { InviteSettings } from "./settings";

/**
 * Compare the cached invites with a fresh fetch after a member joins.
 *
 * Discord does not tell us which invite was used, so the only signal is an
 * incremented `uses` counter. If several invites changed (a stale cache, or two
 * joins in the same tick) the largest increase wins and ties break on the code,
 * which keeps the result deterministic and testable.
 */
export function attributeInvite(
  before: readonly InviteSource[],
  after: readonly InviteSource[],
): InviteAttribution | undefined {
  const previous = new Map(before.map((invite) => [invite.code, invite]));
  const changed = after
    .map((invite) => {
      const usesBefore = previous.get(invite.code)?.uses ?? 0;
      return { invite, usesBefore, delta: invite.uses - usesBefore };
    })
    .filter((entry) => entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.invite.code.localeCompare(b.invite.code));

  const winner = changed[0];
  if (!winner?.invite.inviterId) return undefined;
  return {
    code: winner.invite.code,
    inviterId: winner.invite.inviterId,
    usesBefore: winner.usesBefore,
    usesAfter: winner.invite.uses,
  };
}

/**
 * Advisory checks, never an automatic punishment. A new account with no avatar
 * is exactly what a raid looks like — and also what a first-time Discord user
 * looks like, which is why the result is a flag on the case file, not a ban.
 */
export function suspiciousReasons(
  profile: { accountAgeDays: number; hasAvatar: boolean },
  settings: InviteSettings,
): string[] {
  const reasons: string[] = [];
  if (settings.minAccountAgeDays > 0 && profile.accountAgeDays < settings.minAccountAgeDays) {
    reasons.push("account-age");
  }
  if (settings.flagNoAvatar && !profile.hasAvatar) reasons.push("no-avatar");
  return reasons;
}

export interface JoinProfile {
  readonly userId: string;
  readonly joinedAt: string;
  /** Whole days between account creation and the join. */
  readonly accountAgeDays: number;
  readonly hasAvatar: boolean;
}

export interface RecordJoinResult {
  readonly recorded: boolean;
  readonly fakeReasons: readonly string[];
}

export class InviteService {
  constructor(
    private readonly store: InviteStore,
    private readonly actions: InviteActions | undefined,
    private readonly settings: InviteSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async recordJoin(
    guildId: string,
    profile: JoinProfile,
    attribution?: InviteAttribution,
  ): Promise<RecordJoinResult> {
    if (!this.settings.enabled) return { recorded: false, fakeReasons: [] };

    const fakeReasons = suspiciousReasons(profile, this.settings);
    const recorded = await this.store.recordJoin({
      guildId,
      userId: profile.userId,
      inviterId: attribution?.inviterId,
      code: attribution?.code,
      joinedAt: profile.joinedAt,
      fakeReasons,
    });

    if (recorded && fakeReasons.length > 0 && this.settings.logChannelId && this.actions) {
      await this.actions.notify(guildId, this.settings.logChannelId, {
        embeds: [
          {
            title: "Suspicious invite join",
            description: attribution
              ? `<@${profile.userId}> joined with invite \`${attribution.code}\` from <@${attribution.inviterId}>.`
              : `<@${profile.userId}> joined without a known invite.`,
            color: 0xf0b232,
            fields: [
              { name: "Flags", value: this.#describe(fakeReasons), inline: false },
            ],
            footer: { text: "Advisory only — no action was taken." },
          },
        ],
      });
    }

    return { recorded, fakeReasons };
  }

  async recordLeave(guildId: string, userId: string): Promise<boolean> {
    if (!this.settings.enabled) return false;
    return this.store.recordLeave(guildId, userId, new Date(this.now()).toISOString());
  }

  async leaderboard(guildId: string, limit?: number): Promise<InviteLeaderboardRow[]> {
    const rows = Math.min(Math.max(limit ?? this.settings.leaderboardSize, 1), 25);
    return this.store.leaderboard(guildId, rows);
  }

  async statsFor(guildId: string, userId: string): Promise<InviteLeaderboardRow | undefined> {
    return this.store.statsFor(guildId, userId);
  }

  async invitee(guildId: string, userId: string): Promise<InviteJoinRecord | undefined> {
    return this.store.invitee(guildId, userId);
  }

  #describe(reasons: readonly string[]): string {
    return reasons
      .map((reason) => {
        if (reason === "account-age") {
          return `account younger than ${this.settings.minAccountAgeDays} days`;
        }
        if (reason === "no-avatar") return "no profile avatar";
        return reason;
      })
      .join("; ");
  }
}
