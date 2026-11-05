import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  ELLIPSIS,
  GLYPHS,
  MAX_ACTIONS,
  MAX_CONTEXT,
  MAX_FACT_PARTS,
  MAX_ROWS,
  MAX_ROW,
  LayoutError,
  actionRow,
  emptyState,
  facts,
  footer,
  heading,
  layout,
  oneLine,
  readStamp,
  row,
  rows,
} from "./index";

describe("theme tokens", () => {
  it("names one accent per state", () => {
    expect(Object.keys(ACCENTS)).toEqual(["brand", "ok", "attention", "danger", "muted"]);
    expect(new Set(Object.values(ACCENTS)).size).toBe(5);
  });

  it("keeps a glyph for every timeline source the moderation module reads", () => {
    for (const name of [
      "timeline",
      "shield",
      "ticket",
      "levels",
      "economy",
      "invites",
      "forms",
      "events",
      "modmail",
      "member",
    ] as const) {
      expect(GLYPHS[name].length).toBeGreaterThan(0);
    }
  });
});

describe("oneLine", () => {
  it("collapses newlines, tabs and repeated spaces", () => {
    expect(oneLine("  a\n\nb\t c   d  ")).toBe("a b c d");
  });

  it("returns an empty string for whitespace only", () => {
    expect(oneLine(" \n\t ")).toBe("");
  });
});

describe("heading", () => {
  it("renders a heading and a tiny context line", () => {
    expect(
      heading({
        glyph: GLYPHS.timeline,
        title: "Mr Bubba · Member timeline",
        context: "this server · events from every module",
      }),
    ).toBe(
      `## ${GLYPHS.timeline} Mr Bubba · Member timeline\n-# this server · events from every module`,
    );
  });

  it("omits the context when there is none", () => {
    expect(heading({ glyph: "🧭", title: "Help" })).toBe("## 🧭 Help");
  });

  it("refuses an empty title", () => {
    expect(() => heading({ glyph: "🧭", title: "  " })).toThrow(LayoutError);
  });

  it("refuses a title longer than the heading cap", () => {
    expect(() => heading({ glyph: "🧭", title: "x".repeat(81) })).toThrow(/80/);
  });

  it("clips a long context onto one line", () => {
    const value = heading({ glyph: "🧭", title: "Help", context: `${"y".repeat(200)}\nsecond` });
    const context = value.split("\n")[1]!;
    expect(context.length).toBeLessThanOrEqual(MAX_CONTEXT + 4);
    expect(context).toContain(ELLIPSIS);
    expect(context).not.toContain("\n");
  });
});

describe("facts", () => {
  it("joins the parts that exist with a middle dot", () => {
    expect(facts(["**Level 4**", undefined, "**120** XP", ""])).toBe("**Level 4** · **120** XP");
  });

  it("returns undefined when nothing is left", () => {
    expect(facts([undefined, "", "  "])).toBeUndefined();
  });

  it("caps the number of parts", () => {
    const line = facts(Array.from({ length: 8 }, (_, index) => `f${index}`))!;
    expect(line.split(" · ")).toHaveLength(MAX_FACT_PARTS);
  });

  it("clips one long part and never emits a newline", () => {
    const line = facts([`${"z".repeat(300)}\nnext`])!;
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line).toContain(ELLIPSIS);
    expect(line).not.toContain("\n");
  });
});

describe("row and rows", () => {
  it("builds a timestamped, source-tagged bullet", () => {
    expect(
      row({
        at: 1_730_000_000,
        text: "**Case #7 opened**",
        source: "cases",
        link: "https://discord.com/channels/1/2",
      }),
    ).toBe("• <t:1730000000:R> · **Case #7 opened** · [channel](https://discord.com/channels/1/2) · `cases`");
  });

  it("leaves out an absent timestamp, link and source", () => {
    expect(row({ text: "Member record opened" })).toBe("• Member record opened");
  });

  it("clips a long row", () => {
    const value = row({ text: "w".repeat(400) });
    expect(value.length).toBeLessThanOrEqual(MAX_ROW + 2);
    expect(value).toContain(ELLIPSIS);
  });

  it("caps the list and reports what it hid", () => {
    const list = Array.from({ length: 15 }, (_, index) => `• r${index}`);
    const { block, hidden } = rows(list);
    expect(block.split("\n")).toHaveLength(MAX_ROWS);
    expect(hidden).toBe(3);
  });

  it("hides nothing when the list fits", () => {
    expect(rows(["• one"]).hidden).toBe(0);
  });
});

describe("emptyState", () => {
  it("states the fact and the next action as tiny text", () => {
    expect(
      emptyState({
        fact: "No activity is recorded in the joined stores.",
        next: "Run /mod warn to open the first case.",
      }),
    ).toBe(
      "-# No activity is recorded in the joined stores.\n-# Run /mod warn to open the first case.",
    );
  });

  it("omits the second line when there is no next action", () => {
    expect(emptyState({ fact: "Nothing yet." })).toBe("-# Nothing yet.");
  });
});

describe("footer", () => {
  it("prefixes each line and drops empty entries", () => {
    expect(footer(["Sources read: cases (2) · tickets", undefined, "Missing: logs", ""])).toBe(
      "-# Sources read: cases (2) · tickets\n-# Missing: logs",
    );
  });

  it("keeps at most three lines", () => {
    const value = footer(["one", "two", "three", "four"]);
    expect(value.split("\n")).toHaveLength(3);
    expect(value).not.toContain("four");
  });
});

describe("readStamp", () => {
  it("renders a relative timestamp in seconds", () => {
    expect(readStamp(1_730_000_000_000, "member timeline")).toBe(
      "Read <t:1730000000:R> · member timeline",
    );
  });

  it("works without a scope", () => {
    expect(readStamp(1_730_000_000_000)).toBe("Read <t:1730000000:R>");
  });

  it("composes with footer without a doubled prefix", () => {
    expect(footer([readStamp(1_730_000_000_000, "8/10 stores joined")])).toBe(
      "-# Read <t:1730000000:R> · 8/10 stores joined",
    );
  });

  it("refuses a non-finite time", () => {
    expect(() => readStamp(Number.NaN)).toThrow(LayoutError);
  });
});

describe("actionRow", () => {
  function build(buttons: Parameters<typeof actionRow>[2]) {
    return layout((ui) => {
      ui.container({ accentColor: ACCENTS.brand }, (box) => {
        actionRow(box, ui, buttons);
      });
    });
  }

  it("renders a secondary refresh and a link button", () => {
    expect(
      build([
        { label: "↻ Refresh", variant: "secondary", customId: "k1:abc:1:timeline:refresh:42" },
        { label: "Docs", variant: "link", url: "https://example.com/docs" },
      ]),
    ).toEqual([
      {
        type: "container",
        accentColor: ACCENTS.brand,
        components: [
          {
            type: "action-row",
            components: [
              {
                type: "button",
                style: "secondary",
                label: "↻ Refresh",
                customId: "k1:abc:1:timeline:refresh:42",
              },
              { type: "button", style: "link", label: "Docs", url: "https://example.com/docs" },
            ],
          },
        ],
      },
    ]);
  });

  it(`refuses more than ${MAX_ACTIONS} buttons`, () => {
    expect(() =>
      build(
        Array.from({ length: 4 }, (_, index) => ({
          label: `B${index}`,
          variant: "secondary" as const,
          customId: `b${index}`,
        })),
      ),
    ).toThrow(/1-3/);
  });

  it("refuses a second primary button", () => {
    expect(() =>
      build([
        { label: "One", variant: "primary", customId: "a" },
        { label: "Two", variant: "primary", customId: "b" },
      ]),
    ).toThrow(/at most one primary/);
  });

  it("refuses a link without a url and a custom id on a link", () => {
    expect(() => build([{ label: "Docs", variant: "link" }])).toThrow(/needs a url/);
    expect(() =>
      build([{ label: "Docs", variant: "link", url: "https://example.com", customId: "x" }]),
    ).toThrow(/cannot carry a custom id/);
  });

  it("refuses a non-link button without a custom id", () => {
    expect(() => build([{ label: "Do", variant: "secondary" }])).toThrow(/needs a custom id/);
  });
});
