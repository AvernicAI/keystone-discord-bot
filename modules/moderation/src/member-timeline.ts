import type {
  CaseServicePort,
  CommunityStore,
  EventStore,
  FormStore,
  InviteStore,
  MemberStore,
  ModmailStore,
} from "@keystone/kernel";

/**
 * The member timeline is a read model, not a new source of truth.
 *
 * Every row names the table it came from. A store that is not wired, or that
 * throws, is reported as such instead of being rendered as "no activity" — a
 * moderator must be able to tell the difference between "nothing happened" and
 * "this screen could not see that store".
 */
export const TIMELINE_SOURCES = [
  "cases",
  "case_events",
  "tickets",
  "levels",
  "economy_ledger",
  "invite_joins",
  "form_submissions",
  "event_rsvps",
  "modmail_threads",
  "members",
] as const;

export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

export type TimelineSourceState = "ok" | "not-wired" | "failed";

export interface TimelineSourceStatus {
  readonly source: TimelineSource;
  readonly state: TimelineSourceState;
  /** Rows seen before the display cap. */
  readonly rows: number;
}

export interface MemberTimelineEntry {
  /** ISO timestamp from the source row. */
  readonly at: string;
  readonly source: TimelineSource;
  readonly text: string;
  /** A real Discord channel link, when the source names one. */
  readonly link?: string;
}

export interface MemberTimelineFacts {
  readonly userId: string;
  readonly level?: number;
  readonly xp?: number;
  readonly rank?: number;
  readonly balance?: number;
  readonly invitedBy?: string;
  readonly invitesRetained?: number;
  readonly joinedAt?: string;
  readonly verifiedAt?: string;
  readonly quarantined?: boolean;
  /** Counts are bounded by the read limit; a `+` is rendered at the cap. */
  readonly openCases?: number;
  readonly openTickets?: number;
  readonly openModmail?: number;
}

export interface MemberTimeline {
  readonly guildId: string;
  readonly facts: MemberTimelineFacts;
  readonly entries: readonly MemberTimelineEntry[];
  readonly truncated: number;
  readonly sources: readonly TimelineSourceStatus[];
}

/**
 * Narrow slices of the ports the command already receives. Keeping them narrow
 * makes the fake in a test the size of the data the model actually reads, not
 * the size of the full store interface.
 */
export interface MemberTimelinePorts {
  readonly cases?: Pick<CaseServicePort, "list" | "listEvents">;
  readonly community?: Pick<
    CommunityStore,
    "getLevel" | "topLevels" | "getBalance" | "listLedger" | "listTickets"
  >;
  readonly invites?: Pick<InviteStore, "invitee" | "statsFor">;
  readonly forms?: Pick<FormStore, "listSubmissions" | "listForms">;
  readonly events?: Pick<EventStore, "listEvents" | "getRsvp">;
  readonly modmail?: Pick<ModmailStore, "listThreads">;
  readonly members?: Pick<MemberStore, "get">;
}

export const TIMELINE_DISPLAY_LIMIT = 12;
const READ_LIMIT = 8;

interface MutableFacts {
  userId: string;
  level?: number;
  xp?: number;
  rank?: number;
  balance?: number;
  invitedBy?: string;
  invitesRetained?: number;
  joinedAt?: string;
  verifiedAt?: string;
  quarantined?: boolean;
  openCases?: number;
  openTickets?: number;
  openModmail?: number;
}

interface Capture<T> {
  readonly ok: true;
  readonly value: T;
}

function unix(at: string): number {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
}

function clean(value: string, max = 90): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const neutral = collapsed
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere")
    .replace(/<@/g, "<@\u200b");
  return neutral.length > max ? `${neutral.slice(0, max - 1)}…` : neutral;
}

function channelLink(guildId: string, channelId: string | undefined): string | undefined {
  return channelId ? `https://discord.com/channels/${guildId}/${channelId}` : undefined;
}

export class MemberTimelineService {
  constructor(private readonly ports: MemberTimelinePorts) {}

  async load(guildId: string, userId: string): Promise<MemberTimeline> {
    const facts: MutableFacts = { userId };
    const entries: MemberTimelineEntry[] = [];
    const counts = new Map<TimelineSource, number>();
    const statuses = new Map<TimelineSource, TimelineSourceState>();

    const mark = (source: TimelineSource, state: TimelineSourceState): void => {
      statuses.set(source, state);
    };
    const missing = (...sources: TimelineSource[]): void => {
      for (const source of sources) mark(source, "not-wired");
    };
    const note = (source: TimelineSource, at: string, text: string, link?: string): void => {
      entries.push({ at, source, text, ...(link ? { link } : {}) });
      counts.set(source, (counts.get(source) ?? 0) + 1);
    };
    const capture = async <T>(
      source: TimelineSource,
      run: () => Promise<T>,
    ): Promise<Capture<T> | undefined> => {
      try {
        mark(source, "ok");
        return { ok: true, value: await run() };
      } catch {
        mark(source, "failed");
        return undefined;
      }
    };

    const cases = this.ports.cases
      ? await capture("cases", () =>
          this.ports.cases!.list(guildId, { targetId: userId, limit: READ_LIMIT }),
        )
      : undefined;
    if (!this.ports.cases) {
      missing("cases", "case_events");
    } else if (!cases) {
      // The list failed; its events cannot be read without the case ids.
      mark("case_events", "failed");
    } else {
      // A failed count must not turn the already-read case list into a failure.
      try {
        const open = await this.ports.cases.list(guildId, {
          targetId: userId,
          state: "open",
          limit: READ_LIMIT,
        });
        facts.openCases = open.length;
      } catch {
        facts.openCases = undefined;
      }
      for (const record of cases.value) {
        note(
          "cases",
          record.createdAt,
          `**Case #${record.caseNumber}** · ${clean(record.action, 30)} · ${record.state} — ${clean(record.reason)}`,
        );
      }
      {
        const events = await capture("case_events", () =>
          Promise.all(
            cases.value.map(async (record) => ({
              record,
              events: await this.ports.cases!.listEvents(record.id),
            })),
          ),
        );
        if (events) {
          for (const group of events.value) {
            for (const event of group.events) {
              if (event.type === "created") continue;
              note(
                "case_events",
                event.createdAt,
                `**Case #${group.record.caseNumber}** · ${clean(event.type, 30)} — ${clean(
                  describeCaseEvent(event.data),
                )}`,
              );
            }
          }
        }
      }
    }

    if (!this.ports.community) {
      missing("tickets", "levels", "economy_ledger");
    } else {
      const profile = await capture("levels", () =>
        Promise.all([
          this.ports.community!.getLevel(guildId, userId),
          this.ports.community!.topLevels(guildId, 100),
        ]),
      );
      if (profile) {
        const [level, top] = profile.value;
        if (level) {
          facts.level = level.level;
          facts.xp = level.xp;
          facts.rank = top.findIndex((row) => row.userId === userId) + 1 || undefined;
          note(
            "levels",
            level.updatedAt,
            `**Level ${level.level}** · ${level.xp.toLocaleString("en-US")} XP`,
          );
        }
      }

      const economy = await capture("economy_ledger", () =>
        Promise.all([
          this.ports.community!.getBalance(guildId, userId),
          this.ports.community!.listLedger(guildId, userId, READ_LIMIT),
        ]),
      );
      if (economy) {
        const [balance, ledger] = economy.value;
        facts.balance = balance;
        for (const row of ledger) {
          note(
            "economy_ledger",
            row.createdAt,
            `**Economy ${row.amount >= 0 ? "+" : ""}${row.amount}** · ${clean(row.reason)}`,
          );
        }
      }

      const tickets = await capture("tickets", () =>
        this.ports.community!.listTickets(guildId, { openerId: userId, limit: READ_LIMIT }),
      );
      if (tickets) {
        const rows = tickets.value;
        try {
          facts.openTickets = (
            await this.ports.community.listTickets(guildId, {
              openerId: userId,
              state: "open",
              limit: READ_LIMIT,
            })
          ).length;
        } catch {
          facts.openTickets = undefined;
        }
        for (const row of rows) {
          note(
            "tickets",
            row.createdAt,
            `**Ticket** · ${row.state} — ${clean(row.subject)}`,
            channelLink(guildId, row.channelId),
          );
          if (row.closedAt) {
            note(
              "tickets",
              row.closedAt,
              `**Ticket closed** · ${clean(row.subject)}`,
              channelLink(guildId, row.channelId),
            );
          }
        }
      }
    }

    if (!this.ports.invites) {
      missing("invite_joins");
    } else {
      const invites = await capture("invite_joins", () =>
        Promise.all([
          this.ports.invites!.invitee(guildId, userId),
          this.ports.invites!.statsFor(guildId, userId),
        ]),
      );
      if (invites) {
        const [join, stats] = invites.value;
        if (join) {
          facts.invitedBy = join.inviterId;
          facts.joinedAt = join.joinedAt;
          note(
            "invite_joins",
            join.joinedAt,
            `**Joined**${join.inviterId ? ` · invited by <@${join.inviterId}>` : ""}${
              join.code ? ` · \`${clean(join.code, 30)}\`` : ""
            }`,
          );
          if (join.leftAt) {
            note("invite_joins", join.leftAt, "**Left the server**");
          }
        }
        if (stats) facts.invitesRetained = stats.retained;
      }
    }

    if (!this.ports.forms) {
      missing("form_submissions");
    } else {
      const forms = await capture("form_submissions", () =>
        Promise.all([
          this.ports.forms!.listSubmissions(guildId, { userId, limit: READ_LIMIT }),
          this.ports.forms!.listForms(guildId, 25),
        ]),
      );
      if (forms) {
        const [submissions, definitions] = forms.value;
        const names = new Map(definitions.map((form) => [form.id, form.name]));
        for (const submission of submissions) {
          const name = names.get(submission.formId) ?? submission.formId;
          note(
            "form_submissions",
            submission.createdAt,
            `**Form ${submission.state}** · ${clean(name, 50)}`,
          );
        }
      }
    }

    if (!this.ports.events) {
      missing("event_rsvps");
    } else {
      const events = await capture("event_rsvps", async () => {
        const rows = await this.ports.events!.listEvents(guildId, READ_LIMIT);
        const rsvps = await Promise.all(
          rows.map(async (event) => ({
            event,
            rsvp: await this.ports.events!.getRsvp(guildId, event.id, userId),
          })),
        );
        return rsvps;
      });
      if (events) {
        for (const { event, rsvp } of events.value) {
          if (!rsvp) continue;
          note(
            "event_rsvps",
            rsvp.updatedAt,
            `**Event ${rsvp.state === "going" ? "going" : "not going"}** · ${clean(event.name, 50)}`,
          );
        }
      }
    }

    if (!this.ports.modmail) {
      missing("modmail_threads");
    } else {
      const modmail = await capture("modmail_threads", () =>
        this.ports.modmail!.listThreads(guildId, { ownerId: userId, limit: READ_LIMIT }),
      );
      if (modmail) {
        const threads = modmail.value;
        try {
          facts.openModmail = (
            await this.ports.modmail.listThreads(guildId, {
              ownerId: userId,
              state: "open",
              limit: 1,
            })
          ).length;
        } catch {
          facts.openModmail = undefined;
        }
        for (const thread of threads) {
          note(
            "modmail_threads",
            thread.createdAt,
            `**Modmail ${thread.state}** · ${clean(thread.subject, 60)} · ${thread.messageCount} message${
              thread.messageCount === 1 ? "" : "s"
            }`,
          );
          if (thread.closedAt) {
            note("modmail_threads", thread.closedAt, `**Modmail closed** · ${clean(thread.subject, 60)}`);
          }
        }
      }
    }

    if (!this.ports.members) {
      missing("members");
    } else {
      const member = await capture("members", () => this.ports.members!.get(guildId, userId));
      if (member?.value) {
        const row = member.value;
        facts.joinedAt = row.joinedAt ?? facts.joinedAt;
        facts.verifiedAt = row.verifiedAt;
        facts.quarantined = row.quarantined;
        if (row.joinedAt) note("members", row.joinedAt, "**Member record opened**");
        if (row.verifiedAt) note("members", row.verifiedAt, "**Verification completed**");
      }
    }

    entries.sort((a, b) => unix(b.at) - unix(a.at));
    const visible = entries.slice(0, TIMELINE_DISPLAY_LIMIT);
    const sources = TIMELINE_SOURCES.map((source) => ({
      source,
      state: statuses.get(source) ?? "not-wired",
      rows: counts.get(source) ?? 0,
    }));

    return {
      guildId,
      facts,
      entries: visible,
      truncated: Math.max(0, entries.length - visible.length),
      sources,
    };
  }
}

function describeCaseEvent(data: unknown): string {
  if (!data || typeof data !== "object") return "recorded";
  const record = data as Record<string, unknown>;
  for (const key of ["note", "message", "detail", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "recorded";
}
