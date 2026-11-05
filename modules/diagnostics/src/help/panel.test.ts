import { describe, expect, it } from "vitest";
import type { CommandCatalogEntry } from "@keystone/kernel";
import { loadHelpFacts, type HelpFacts, type HelpFactsPorts } from "./facts";
import {
  helpChangelogPanel,
  helpHomePanel,
  helpModulePanel,
  helpPrivacyPanel,
} from "./panel";

const actions = {
  browse: "signed-browse",
  home: "signed-home",
  privacy: "signed-privacy",
  changelog: "signed-changelog",
};

function entry(
  name: string,
  moduleId: string,
  subcommands: string[] = [],
): CommandCatalogEntry {
  return {
    name,
    moduleId,
    description: `${name} commands`,
    options: [],
    subcommands: subcommands.map((subcommand) => ({
      name: subcommand,
      description: `${subcommand} action`,
      options: [],
    })),
  };
}

const catalog = [
  entry("mod", "moderation", ["ban", "kick"]),
  entry("history", "moderation", ["user"]),
  entry("event", "events", ["create", "list", "rsvp"]),
  { ...entry("rank", "leveling"), type: "user" as const },
  { ...entry("report", "moderation"), type: "message" as const },
];

const facts: HelpFacts = {
  modules: [
    { id: "moderation", name: "Moderation", enabled: true, roots: 2, subcommands: 3 },
    { id: "events", name: "Events", enabled: false, roots: 1, subcommands: 3 },
  ],
  modulesKnown: true,
  modulesOn: 1,
  modulesTotal: 2,
  roots: 3,
  subcommands: 6,
  menus: 2,
  database: { configured: true, reachable: true, migrated: true },
  cache: { configured: true, reachable: true, detail: "redis" },
  disabledFeatures: ["music playback"],
  tickets: { count: 2, capped: false },
  cases: { count: 1, capped: false },
};

describe("help home panel", () => {
  it("renders the server state, registry totals and signed controls as one container", () => {
    const panel = helpHomePanel(facts, actions);
    expect(panel).toHaveLength(1);
    const container = panel[0];
    expect(container?.type).toBe("container");
    if (container?.type !== "container") throw new Error("expected a container");
    expect(container.accentColor).toBe(0x5865f2);
    expect(container.components).toHaveLength(9);

    const json = JSON.stringify(panel);
    expect(json).toContain("**This server**");
    expect(json).toContain("Modules **1/2 on**");
    expect(json).toContain("Tickets **2 open**");
    expect(json).toContain("Cases **1 open**");
    expect(json).toContain("Data **ready**");
    expect(json).toContain("Cache **Redis**");
    expect(json).toContain("Not available here: music playback");
    expect(json).toContain("3 roots · 6 subcommands · 2 context menus");
    expect(json).toContain("signed-browse");
    expect(json).toContain("signed-privacy");
    expect(json).toContain("signed-changelog");
  });

  it("lists every module with its state and marks no option selected on home", () => {
    const panel = helpHomePanel(facts, actions);
    const rows = panel[0]?.type === "container" ? panel[0].components : [];
    const selectRow = rows.find((row) => row.type === "action-row");
    const select = selectRow?.type === "action-row" ? selectRow.components[0] : undefined;
    expect(select?.type).toBe("select");
    if (select?.type !== "select") throw new Error("expected a select");
    expect(select.options.map((option) => option.value)).toEqual(["moderation", "events"]);
    expect(select.options[0]?.description).toContain("on");
    expect(select.options[1]?.description).toContain("off");
    expect(select.options.some((option) => option.default)).toBe(false);
  });

  it("omits the case count for a caller without ModerateMembers", () => {
    const json = JSON.stringify(
      helpHomePanel({ ...facts, cases: undefined }, actions),
    );
    expect(json).not.toContain("Cases **");
  });

  it("still renders when settings and health are unavailable", () => {
    const panel = helpHomePanel(
      {
        ...facts,
        modulesKnown: false,
        modulesOn: 0,
        database: null,
        cache: null,
        tickets: undefined,
        cases: undefined,
        disabledFeatures: [],
      },
      actions,
    );
    const json = JSON.stringify(panel);
    expect(json).toContain("Modules **2 registered** · settings unavailable");
    expect(json).toContain("Data **unknown**");
    expect(json).toContain("Cache **unknown**");
  });
});

describe("help module panel", () => {
  it("lists roots and subcommands, defaults the picker and offers Overview", () => {
    const panel = helpModulePanel(facts.modules[0]!, catalog.slice(0, 2), actions);
    const json = JSON.stringify(panel);
    expect(json).toContain("## Moderation");
    expect(json).toContain("**2 roots · 3 subcommands** · on");
    expect(json).toContain("**/mod** · 2");
    expect(json).toContain("`ban` `kick`");
    expect(json).toContain("**/history** · 1");
    expect(json).toContain("signed-home");

    const container = panel[0];
    if (container?.type !== "container") throw new Error("expected a container");
    const select = container.components
      .filter((component) => component.type === "action-row")
      .flatMap((component) => component.components)
      .find((component) => component.type === "select");
    if (select?.type !== "select") throw new Error("expected a select");
    expect(select.options[0]?.default).toBe(true);
  });

  it("says a disabled module is off and points at setup", () => {
    const json = JSON.stringify(
      helpModulePanel(facts.modules[1]!, [catalog[2]!], actions),
    );
    expect(json).toContain("· off");
    expect(json).toContain("This module is off in this server");
  });

  it("clips a large module to the text budget instead of throwing", () => {
    const huge = {
      id: "huge",
      name: "Huge",
      enabled: true,
      roots: 80,
      subcommands: 960,
    };
    const entries = Array.from({ length: 80 }, (_, root) => ({
      name: `root${root}`,
      subcommands: Array.from({ length: 12 }, (_, index) => ({
        name: `action${index}`,
      })),
    }));

    const panel = helpModulePanel(huge, entries, actions);
    const json = JSON.stringify(panel);
    expect(json).toContain("more roots");
    expect(json.length).toBeLessThan(7_000);
  });
});

describe("help secondary pages", () => {
  it("renders privacy and changelog through the same layout with an Overview button", () => {
    for (const panel of [helpPrivacyPanel(actions), helpChangelogPanel(actions)]) {
      const json = JSON.stringify(panel);
      expect(json).toContain("signed-home");
      expect(json).toContain("Overview");
      expect(json).not.toContain("undefined");
    }
  });
});

describe("loadHelpFacts", () => {
  const base: HelpFactsPorts = {
    guildId: "g1",
    permissions: ["ModerateMembers"],
    catalog,
    config: {
      list: async () => [
        { id: "moderation", name: "Moderation", settings: { enabled: true } },
        { id: "events", name: "Events", settings: { enabled: false } },
      ],
    },
    health: {
      probe: async () => ({
        database: { configured: true, reachable: true, migrated: true },
        cache: { configured: true, reachable: true, detail: "redis" },
        capabilities: {
          profile: "full" as const,
          intents: [],
          disabledFeatures: ["music playback"],
        },
      }),
    },
    community: {
      store: {
        listTickets: async () => [
          { state: "open" },
          { state: "claimed" },
          { state: "closed" },
        ],
      },
    },
    moderation: {
      cases: {
        list: async (_guildId: string, filter?: { state?: string }) =>
          filter?.state === "open" ? [{ id: "case-1" }] : [{ id: "case-2" }],
      },
    },
  } as unknown as HelpFactsPorts;

  it("groups roots by module and counts the open rows", async () => {
    const loaded = await loadHelpFacts(base);
    expect(loaded.modulesKnown).toBe(true);
    expect(loaded.modules).toEqual([
      { id: "moderation", name: "Moderation", enabled: true, roots: 2, subcommands: 3 },
      { id: "events", name: "Events", enabled: false, roots: 1, subcommands: 3 },
    ]);
    expect(loaded.roots).toBe(3);
    expect(loaded.subcommands).toBe(6);
    expect(loaded.menus).toBe(2);
    expect(loaded.tickets).toEqual({ count: 2, capped: false });
    expect(loaded.cases).toEqual({ count: 2, capped: false });
    expect(loaded.disabledFeatures).toEqual(["music playback"]);
  });

  it("does not read cases without the moderation permission", async () => {
    const loaded = await loadHelpFacts({ ...base, permissions: [] });
    expect(loaded.cases).toBeUndefined();
    expect(loaded.tickets?.count).toBe(2);
  });

  it("degrades each failed source instead of rejecting the command", async () => {
    const loaded = await loadHelpFacts({
      ...base,
      config: { list: async () => { throw new Error("settings down"); } },
      health: { probe: async () => { throw new Error("database down"); } },
      community: { store: { listTickets: async () => { throw new Error("tickets down"); } } } as never,
      moderation: { cases: { list: async () => { throw new Error("cases down"); } } } as never,
    });
    expect(loaded.modulesKnown).toBe(false);
    expect(loaded.modules.map((module) => module.name)).toEqual(["moderation", "events"]);
    expect(loaded.database).toBeNull();
    expect(loaded.cache).toBeNull();
    expect(loaded.tickets).toBeUndefined();
    expect(loaded.cases).toBeUndefined();
  });

  it("marks a count at the query limit as a lower bound", async () => {
    const loaded = await loadHelpFacts({
      ...base,
      community: {
        store: {
          listTickets: async () =>
            Array.from({ length: 100 }, () => ({ state: "open" })),
        },
      } as never,
    });
    expect(loaded.tickets).toEqual({ count: 100, capped: true });
  });
});
