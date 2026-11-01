import { describe, expect, it } from "vitest";
import { commandDrift, hasDrift, type CommandJson } from "./command-sync";

const history: CommandJson = {
  name: "mod",
  description: "Moderation",
  options: [
    { name: "history", type: 1, description: "Show history" },
  ],
};

describe("commandDrift", () => {
  it("treats an identical tree as current", () => {
    const drift = commandDrift([history], [
      {
        name: "mod",
        description: "Moderation",
        options: [{ name: "history", type: 1, description: "Show history", required: false }],
      },
    ]);
    expect(hasDrift(drift)).toBe(false);
  });

  it("sees a shape change that keeps the root name", () => {
    const flat: CommandJson = {
      name: "mod",
      description: "Moderation",
      options: [
        { name: "action", type: 3, description: "Action", choices: [{ name: "history", value: "history" }] },
      ],
    };
    const drift = commandDrift([history], [flat]);
    expect(drift.changed).toEqual(["mod"]);
    expect(hasDrift(drift)).toBe(true);
  });

  it("reports missing and extra roots", () => {
    const drift = commandDrift([history], [{ name: "ping", description: "Ping" }]);
    expect(drift).toMatchObject({ missing: ["mod"], extra: ["ping"], changed: [] });
  });
});
