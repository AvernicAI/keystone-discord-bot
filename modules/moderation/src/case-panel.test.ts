import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENTS } from "@keystone/ui";
import type { ModerationCase } from "@keystone/kernel";
import { appealStatusPanel, caseAccent, caseListPanel, casePanel } from "./format";

const READ_AT = Date.parse("2026-11-06T12:00:00.000Z");

function record(overrides: Partial<ModerationCase> = {}): ModerationCase {
  return {
    id: "case-1",
    guildId: "guild-1",
    caseNumber: 42,
    actorId: "mod-1",
    targetId: "member-1",
    action: "ban",
    reason: "posting raid invites",
    rule: "manual",
    state: "open",
    createdAt: "2026-11-06T10:00:00.000Z",
    updatedAt: "2026-11-06T10:00:00.000Z",
    ...overrides,
  };
}

function rendered(value: ReturnType<typeof casePanel>): string {
  return JSON.stringify(value);
}

describe("case panel", () => {
  it("renders the case as heading, facts, reason and an in-card action row", () => {
    const panel = rendered(
      casePanel(record(), { appealId: "k1:appeal-id", readAt: READ_AT }),
    );

    expect(panel).toContain("Case #42 · ban");
    expect(panel).toContain("this server · rule manual");
    expect(panel).toContain("Target <@member-1>");
    expect(panel).toContain("Actor <@mod-1>");
    expect(panel).toContain("State **open**");
    expect(panel).toContain("**Reason**\\nposting raid invites");
    expect(panel).toContain(`Read <t:${Math.floor(READ_AT / 1_000)}:R>`);
    expect(panel).toContain("events are append-only");
    // The appeal control is one action row inside the same container: a
    // forwarded screenshot cannot separate the record from its action.
    const [container] = casePanel(record(), { appealId: "k1:appeal-id", readAt: READ_AT });
    expect(container?.type).toBe("container");
    if (container?.type !== "container") throw new Error("expected a container");
    const row = container.components.at(-1);
    expect(row?.type).toBe("action-row");
    if (row?.type !== "action-row") throw new Error("expected an action row");
    expect(row.components).toMatchObject([
      { type: "button", style: "primary", label: "⚖ Appeal this case", customId: "k1:appeal-id" },
    ]);
  });

  it("clips a reason past the layout budget instead of throwing on the card", () => {
    const panel = rendered(
      casePanel(record({ reason: "x".repeat(6_000) }), { readAt: READ_AT }),
    );
    expect(panel).toContain("…");
    expect(panel).not.toContain("x".repeat(1_600));
  });

  it("keeps one primary: verify is primary, appeal steps down", () => {
    const [container] = casePanel(record({ rule: "join-gate.age" }), {
      appealId: "k1:appeal-id",
      verifyId: "k1:verify-id",
      accent: ACCENTS.danger,
      dryRun: false,
      readAt: READ_AT,
    });
    if (container?.type !== "container") throw new Error("expected a container");
    expect(container.accentColor).toBe(ACCENTS.danger);
    const row = container.components.at(-1);
    if (row?.type !== "action-row") throw new Error("expected an action row");
    expect(row.components.map((button) => ("style" in button ? button.style : ""))).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("never lets a dry run look like an enforcement", () => {
    const panel = rendered(
      casePanel(record(), { accent: ACCENTS.attention, dryRun: true, readAt: READ_AT }),
    );
    expect(panel).toContain("Dry run: no punitive action was taken.");
    expect(caseAccent(record({ state: "reviewed" }))).toBe(ACCENTS.brand);
  });

  it("shows an expiry as a release time, not a second case", () => {
    const panel = rendered(
      casePanel(record({ expiresAt: "2026-11-06T13:00:00.000Z" }), { readAt: READ_AT }),
    );
    expect(panel).toContain("Expires <t:");
    expect(panel).toContain("The expiry is a scheduled release, not a second case.");
    expect(panel).not.toContain("Dry run");
  });

  it("has no raw hex colour left in the file", () => {
    const source = readFileSync(new URL("./format.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/0x[0-9a-fA-F]{6}/);
  });
});

describe("case list panel", () => {
  it("renders rows that name their source and caps itself", () => {
    const records = Array.from({ length: 14 }, (_, index) =>
      record({
        id: `case-${index}`,
        caseNumber: index + 1,
        action: index % 2 === 0 ? "warn" : "ban",
        state: index === 0 ? "reviewed" : "open",
        reason: `reason ${index + 1}`,
      }),
    );
    const panel = rendered(caseListPanel(records, "Recent cases", { readAt: READ_AT }));
    expect(panel).toContain("Recent cases");
    expect(panel).toContain("this server · newest first · 14 shown");
    expect(panel).toContain("open **13**");
    expect(panel).toContain("reviewed **1**");
    expect(panel).toContain("#1 · warn · <@member-1> · **reviewed** · reason 1");
    expect(panel).toContain("#12 · ban · <@member-1> · **open** · reason 12");
    // The caller supplies newest first; the panel caps the list and says how
    // many rows the reader cannot see.
    expect(panel).not.toContain("#13");
    expect(panel).toContain("+2 older not shown.");
    expect(panel).toContain("`cases`");
    expect(panel).toContain("Read <t:");
  });

  it("is a dead end without a next action", () => {
    const panel = rendered(caseListPanel([], "Cases for <@member-1>", { readAt: READ_AT }));
    expect(panel).toContain("No cases matched this read.");
    expect(panel).toContain("/mod warn user:@member reason:");
  });
});

describe("appeal status panel", () => {
  it("reads appeals from events, not from the case state", () => {
    const panel = rendered(
      appealStatusPanel(
        [
          {
            record: record({ state: "reviewed" }),
            appeals: [
              {
                id: "event-1",
                caseId: "case-1",
                type: "appealed",
                actorId: "member-1",
                data: { message: "I was not the one posting links." },
                createdAt: "2026-11-06T11:00:00.000Z",
              },
            ],
          },
        ],
        "Your appeals",
        { readAt: READ_AT },
      ),
    );
    expect(panel).toContain("#42 · ban · **reviewed** · 1 appeal");
    expect(panel).toContain("I was not the one posting links.");
    expect(panel).toContain("`case_events`");
    expect(panel).toContain("A case state may change after review; the event cannot.");
  });

  it("names the command that starts the first appeal", () => {
    const panel = rendered(appealStatusPanel([], "Your appeals", { readAt: READ_AT }));
    expect(panel).toContain("No appeal events are on record for you.");
    expect(panel).toContain("/appeal open case:<number>");
  });
});
