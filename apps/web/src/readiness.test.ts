import { describe, expect, it } from "vitest";
import { buildReadiness } from "./readiness";

const base = {
  guildId: "111111111111111111",
  modulesEnabled: 1,
  modulesTotal: 12,
  loggingReady: true,
  welcomeReady: true,
  hasImport: true,
} as const;

describe("setup readiness", () => {
  it("counts only computed facts and links each one to the fix", () => {
    const ready = buildReadiness(base);
    expect(ready.done).toBe(4);
    expect(ready.total).toBe(4);
    expect(ready.ready).toBe(true);
    expect(ready.items.map((item) => item.id)).toEqual(["modules", "logging", "welcome", "import"]);
    expect(ready.items.every((item) => item.href.startsWith("/dashboard/guilds/"))).toBe(true);
  });

  it("does not call a server ready when a destination is missing", () => {
    const partial = buildReadiness({ ...base, loggingReady: false, welcomeReady: false });
    expect(partial.done).toBe(2);
    expect(partial.ready).toBe(false);
    expect(partial.items.find((item) => item.id === "logging")?.detail).toContain("No logging channel");
    expect(partial.items.find((item) => item.id === "welcome")?.detail).toContain("Welcome is off");
  });

  it("treats zero enabled modules as not ready and says why", () => {
    const empty = buildReadiness({ ...base, modulesEnabled: 0 });
    expect(empty.items[0]).toMatchObject({ done: false, action: "Open modules" });
    expect(empty.items[0]?.detail).toContain("Every module is off");
  });
});
