import { describe, expect, it } from "vitest";
import { CaseService, InMemoryCaseStore } from "./cases";
import { CaseExportService } from "./case-export";

const NOW = 1_700_000_000_000;

async function seeded() {
  const cases = new CaseService(new InMemoryCaseStore());
  const first = await cases.open({
    guildId: "guild-1",
    actorId: "mod-1",
    targetId: "target-1",
    action: "warn",
    reason: 'spam, "quoted" and\nmultiline',
    rule: "manual",
    state: "open",
  });
  await cases.note(first.id, "mod-2", "reviewed the evidence");
  const second = await cases.open({
    guildId: "guild-1",
    actorId: "mod-1",
    targetId: "target-1",
    action: "timeout",
    reason: "cool off",
    rule: "manual",
    state: "open",
  });
  await cases.open({
    guildId: "guild-1",
    actorId: "mod-1",
    targetId: "target-2",
    action: "kick",
    reason: "raid",
    rule: "manual",
    state: "open",
  });
  return { cases, first, second };
}

describe("case export", () => {
  it("exports one case with its append-only events and a checksum", async () => {
    const { cases, first } = await seeded();
    const service = new CaseExportService(cases, () => NOW);

    const exported = await service.one("guild-1", first.caseNumber, "json");

    expect(exported?.fileName).toBe(`keystone-case-${first.caseNumber}.json`);
    expect(exported?.cases).toBe(1);
    expect(exported?.events).toBe(2);
    expect(exported?.checksum).toMatch(/^[a-f0-9]{64}$/);
    const parsed = JSON.parse(exported!.content) as {
      format: string;
      caseCount: number;
      eventCount: number;
      checksum: string;
      cases: { caseNumber: number; reason: string; events: { type: string }[] }[];
    };
    expect(parsed.format).toBe("keystone.case-export.v1");
    expect(parsed.caseCount).toBe(1);
    expect(parsed.eventCount).toBe(2);
    expect(parsed.checksum).toBe(exported?.checksum);
    expect(parsed.cases[0]?.caseNumber).toBe(first.caseNumber);
    expect(parsed.cases[0]?.reason).toBe('spam, "quoted" and\nmultiline');
    expect(parsed.cases[0]?.events.map((event) => event.type)).toEqual(["created", "note"]);
  });

  it("returns undefined for a case that does not exist", async () => {
    const { cases } = await seeded();
    const service = new CaseExportService(cases, () => NOW);
    expect(await service.one("guild-1", 99, "json")).toBeUndefined();
  });

  it("writes one CSV row per case, escapes cells and keeps the same content checksum", async () => {
    const { cases, first } = await seeded();
    const service = new CaseExportService(cases, () => NOW);

    const json = await service.one("guild-1", first.caseNumber, "json");
    const csv = await service.one("guild-1", first.caseNumber, "csv");

    expect(csv?.fileName).toBe(`keystone-case-${first.caseNumber}.csv`);
    expect(csv?.checksum).toBe(json?.checksum);
    const lines = csv!.content.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("case,action,state");
    // The quoted reason is one escaped cell, not three broken rows.
    expect(lines[1]).toContain('"spam, ""quoted"" and');
    expect(lines[1]).toContain(csv?.checksum);
  });

  it("exports a short recent range scoped to one member and a cap", async () => {
    const { cases } = await seeded();
    const service = new CaseExportService(cases, () => NOW);

    const range = await service.recent("guild-1", { targetId: "target-1", limit: 1 }, "csv");
    const rows = range.content.split("\r\n").filter(Boolean);
    expect(range.cases).toBe(1);
    expect(range.events).toBe(1);
    expect(range.fileName).toBe("keystone-cases-2023-11-14.csv");
    expect(rows).toHaveLength(2);
    expect(rows[1]?.startsWith("2,timeout")).toBe(true);

    const all = await service.recent("guild-1", {}, "csv");
    expect(all.cases).toBe(3);
  });
});
