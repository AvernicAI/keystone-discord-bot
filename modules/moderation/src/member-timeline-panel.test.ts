import { describe, expect, it } from "vitest";
import type { MemberTimeline } from "./member-timeline";
import { memberTimelinePanel } from "./member-timeline-panel";

function timeline(overrides: Partial<MemberTimeline> = {}): MemberTimeline {
  return {
    guildId: "guild-1",
    facts: {
      userId: "member-1",
      level: 4,
      xp: 1_240,
      rank: 2,
      balance: 60,
      invitedBy: "inviter-1",
      invitesRetained: 3,
      joinedAt: "2026-11-04T08:00:00.000Z",
      verifiedAt: "2026-11-04T09:00:00.000Z",
      openCases: 1,
      openTickets: 0,
      openModmail: 1,
    },
    entries: [
      {
        at: "2026-11-05T12:00:00.000Z",
        source: "economy_ledger",
        text: "**Economy +25** · daily",
      },
      {
        at: "2026-11-05T10:00:00.000Z",
        source: "cases",
        text: "**Case #7** · ban · open — raid invites",
      },
      {
        at: "2026-11-05T09:00:00.000Z",
        source: "tickets",
        text: "**Ticket** · closed — payment help",
        link: "https://discord.com/channels/guild-1/channel-1",
      },
    ],
    truncated: 2,
    sources: [
      { source: "cases", state: "ok", rows: 1 },
      { source: "case_events", state: "ok", rows: 0 },
      { source: "tickets", state: "ok", rows: 1 },
      { source: "levels", state: "ok", rows: 1 },
      { source: "economy_ledger", state: "ok", rows: 1 },
      { source: "invite_joins", state: "ok", rows: 0 },
      { source: "form_submissions", state: "failed", rows: 0 },
      { source: "event_rsvps", state: "not-wired", rows: 0 },
      { source: "modmail_threads", state: "ok", rows: 0 },
      { source: "members", state: "ok", rows: 0 },
    ],
    ...overrides,
  };
}

function rendered(value: MemberTimeline): string {
  return JSON.stringify(memberTimelinePanel(value));
}

describe("member timeline panel", () => {
  it("renders facts, source-tagged rows and a ticket link in one V2 container", () => {
    const panel = memberTimelinePanel(timeline());
    const text = JSON.stringify(panel);

    expect(panel[0]?.type).toBe("container");
    expect(text).toContain("Member timeline");
    expect(text).toContain("<@member-1>");
    expect(text).toContain("**Level 4**");
    expect(text).toContain("1,240 XP");
    expect(text).toContain("rank #2");
    expect(text).toContain("60 coins");
    expect(text).toContain("invited by <@inviter-1>");
    expect(text).toContain("Cases **1 open**");
    expect(text).toContain("Tickets **0 open**");
    expect(text).toContain("Modmail **1 open**");
    expect(text).toContain("`economy_ledger`");
    expect(text).toContain("`cases`");
    expect(text).toContain("https://discord.com/channels/guild-1/channel-1");
    expect(text).toContain("+2 older rows not shown");
  });

  it("names failed and unwired sources instead of rendering them as empty", () => {
    const text = rendered(timeline());
    expect(text).toContain("Sources read:");
    expect(text).toContain("Failed: form_submissions");
    expect(text).toContain("Not wired: event_rsvps");
    expect(text).toContain("Not joined: logs (no member index), AI labels (advisory only).");
  });

  it("renders an honest empty state", () => {
    const text = rendered(timeline({ entries: [], truncated: 0 }));
    expect(text).toContain("No activity is recorded in the joined stores.");
    expect(text).not.toContain("older row");
  });

  it("stays inside the Components V2 layout budget", () => {
    const panel = memberTimelinePanel(
      timeline({
        entries: Array.from({ length: 12 }, (_, index) => ({
          at: `2026-11-05T${String(index + 1).padStart(2, "0")}:00:00.000Z`,
          source: "cases" as const,
          text: `**Case #${index + 1}** · open — ${"reason ".repeat(10)}`,
        })),
      }),
    );
    expect(panel).toHaveLength(1);
    expect(JSON.stringify(panel).length).toBeLessThan(8_000);
  });
});
