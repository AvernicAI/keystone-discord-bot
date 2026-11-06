import { describe, expect, it } from "vitest";
import { modules } from "@keystone/module-catalog";
import { groupModules, MODULE_GROUPS } from "./module-groups";

describe("module catalog grouping", () => {
  it("places every registered module exactly once", () => {
    const groups = groupModules(modules);
    const ids = groups.flatMap((group) => group.modules.map((module) => module.id));
    expect(ids.sort()).toEqual(modules.map((module) => module.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups.some((group) => group.id === "other")).toBe(false);
  });

  it("keeps the declared group order", () => {
    const groups = groupModules(modules);
    expect(groups.map((group) => group.id)).toEqual(
      MODULE_GROUPS.filter((group) => modules.some((module) => group.modules.includes(module.id))).map(
        (group) => group.id,
      ),
    );
  });

  it("appends an unplaced module instead of dropping it", () => {
    const groups = groupModules([...modules, { id: "new-module" }]);
    expect(groups.at(-1)).toMatchObject({ id: "other" });
    expect(groups.at(-1)?.modules.map((module) => module.id)).toEqual(["new-module"]);
  });
});
