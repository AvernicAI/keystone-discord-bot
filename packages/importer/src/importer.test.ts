import { describe, expect, it } from "vitest";
import {
  BundleError,
  PortabilityService,
  canonicalJson,
  checksumSnapshot,
  createBundle,
  mergeSnapshot,
  parseBundle,
  parseDelimited,
  parseHtmlTranscript,
  parseJsonTranscript,
  parseMee6,
  serializeBundle,
  type GuildSnapshot,
  type PortabilityStore,
} from "./index";

const GUILD = "999999999999999999";
const USER_A = "111111111111111111";
const USER_B = "222222222222222222";

function fixture(overrides: Partial<GuildSnapshot> = {}): GuildSnapshot {
  return {
    guild: {
      id: GUILD,
      name: "Fixture",
      locale: "en",
      plan: "free",
      joinedAt: "2026-10-31T00:00:00.000Z",
      leftAt: null,
    },
    settings: [
      { module: "moderation", key: "dryRun", value: false, updatedAt: "2026-10-31T00:00:00.000Z" },
      { module: "community", key: "welcome", value: { enabled: true, channelId: "444444444444444444" }, updatedAt: "2026-10-31T00:00:00.000Z" },
    ],
    members: [],
    cases: [],
    caseEvents: [],
    tickets: [],
    levels: [
      { userId: USER_A, xp: 1200, level: 12, updatedAt: "2026-10-31T00:00:00.000Z" },
      { userId: USER_B, xp: 300, level: 3, updatedAt: "2026-10-31T00:00:00.000Z" },
    ],
    xpEvents: [],
    economyLedger: [],
    auditEvents: [],
    communityRecords: [],
    aiDocuments: [],
    aiUsage: [],
    caseCounter: null,
    ...overrides,
  };
}

describe("portability bundles", () => {
  it("round-trips a snapshot and preserves JSON number strings", () => {
    const snapshot = fixture({
      settings: [
        ...fixture().settings,
        { module: "test", key: "numeric", value: "123", updatedAt: "2026-10-31T00:00:00.000Z" },
      ],
    });
    const parsed = parseBundle(serializeBundle(createBundle(snapshot)));
    const numeric = parsed.snapshot.settings.find((row) => row.key === "numeric");
    expect(numeric?.value).toBe("123");
    expect(checksumSnapshot(parsed.snapshot)).toBe(parsed.manifest.checksum);
  });

  it("refuses an edited bundle before any write", () => {
    const bundle = parseBundle(serializeBundle(createBundle(fixture())));
    bundle.snapshot.settings[0]!.value = true;
    try {
      parseBundle(JSON.stringify(bundle));
      throw new Error("expected a checksum failure");
    } catch (error) {
      expect(error).toBeInstanceOf(BundleError);
      expect((error as BundleError).code).toBe("checksum");
    }
  });

  it("refuses an unsupported major version", () => {
    const bundle = JSON.parse(serializeBundle(createBundle(fixture())));
    bundle.manifest.version = 99;
    expect(() => parseBundle(JSON.stringify(bundle))).toThrow(/version 99 is not supported/);
  });

  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("dry-run reports a diff without writing", async () => {
    const current = fixture();
    let writes = 0;
    const store = {
      snapshot: async () => current,
      replaceGuild: async () => {
        writes += 1;
      },
    } as unknown as PortabilityStore;
    const service = new PortabilityService(store);
    const bundle = createBundle(fixture({ settings: [] }));
    const outcome = await service.importBundle(bundle, GUILD, { mode: "replace", dryRun: true });

    expect(outcome.state).toBe("dry-run");
    expect(outcome.diff.settings.removed).toBe(2);
    expect(writes).toBe(0);
  });
});

describe("level importers", () => {
  it("parses a MEE6 leaderboard, skips bad ids and keeps the higher duplicate", () => {
    const imported = parseMee6({
      players: [
        { id: USER_A, xp: 500, level: 5 },
        { id: USER_A, xp: 800, level: 8 },
        { id: "not-a-snowflake", xp: 900, level: 9 },
        { id: USER_B, xp: 100 },
      ],
    });
    expect(imported.rows).toEqual([
      { userId: USER_A, xp: 800, sourceLevel: 8 },
      { userId: USER_B, xp: 100 },
    ]);
    expect(imported.skipped).toBe(2);
  });

  it("parses quoted generic CSV and common column names", () => {
    const imported = parseDelimited({
      filename: "levels.csv",
      content: 'user_id,experience,level\n"111111111111111111","1234",12\n"bad",10,1\n',
    });
    expect(imported.rows[0]).toEqual({
      userId: USER_A,
      xp: 1234,
      sourceLevel: 12,
    });
    expect(imported.skipped).toBe(1);
  });

  it("derives XP from a level when the export has no XP column", () => {
    const imported = parseDelimited({
      filename: "levels.tsv",
      content: "user_id\tlevel\n111111111111111111\t7\n",
    });
    expect(imported.rows[0]?.xp).toBe(700);
  });
});

describe("transcript archives", () => {
  it("normalizes a JSON transcript without pretending to rebuild messages", () => {
    const transcript = parseJsonTranscript(
      JSON.stringify({
        source: "ProBot",
        ticket: { subject: "Broken role" },
        messages: [
          { author: { username: "alice" }, content: "Help", timestamp: "2026-10-31T10:00:00Z" },
          { author: "bob", content: "Looking" },
        ],
      }),
    );
    expect(transcript.source).toBe("probot");
    expect(transcript.title).toBe("Broken role");
    expect(transcript.messageCount).toBe(2);
    expect(transcript.text).toContain("alice: Help");
  });

  it("strips an HTML transcript to readable text", () => {
    const transcript = parseHtmlTranscript(
      "<html><head><title>Ticket #4</title><style>body{}</style></head><body><div class='message'>hello &amp; welcome</div><script>alert(1)</script></body></html>",
    );
    expect(transcript.title).toBe("Ticket #4");
    expect(transcript.text).toContain("hello & welcome");
    expect(transcript.text).not.toContain("alert(1)");
  });
});

describe("merge", () => {
  it("keeps the higher XP and applies incoming settings", () => {
    const merged = mergeSnapshot(fixture(), fixture({
      settings: [{ module: "moderation", key: "dryRun", value: true, updatedAt: "2026-10-31T01:00:00.000Z" }],
      levels: [{ userId: USER_A, xp: 900, level: 9, updatedAt: "2026-10-31T01:00:00.000Z" }],
    }), "keep-higher");

    expect(merged.levels.find((row) => row.userId === USER_A)?.xp).toBe(1200);
    expect(merged.settings.find((row) => row.key === "dryRun")?.value).toBe(true);
  });

  it("adds XP on top and recomputes the Keystone level curve", () => {
    const merged = mergeSnapshot(fixture(), fixture({
      levels: [{ userId: USER_A, xp: 100, level: 1, updatedAt: "2026-10-31T01:00:00.000Z" }],
    }), "add-on-top");
    expect(merged.levels.find((row) => row.userId === USER_A)).toMatchObject({
      xp: 1300,
      level: 13,
    });
  });
});
