import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPgliteDatabase, type PgliteHarness } from "./testing";
import { migrate } from "./migrator";
import { DrizzleLoggingStore } from "./logging-store";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "keystone-logging-"));
  dirs.push(dir);
  return dir;
}

async function open(dir: string): Promise<PgliteHarness> {
  const harness = await createPgliteDatabase(dir);
  await migrate(harness.runner);
  return harness;
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("logging persistence", () => {
  it("appends, reads newest first and keeps guilds isolated", async () => {
    const harness = await open(await tempDir());
    const store = new DrizzleLoggingStore(harness.db);

    await store.append({
      guildId: "guild-a",
      kind: "message_delete",
      actorId: "member-1",
      channelId: "channel-1",
      messageId: "message-1",
      summary: "first",
      data: { content: "hello" },
      at: Date.parse("2026-11-01T00:00:00.000Z"),
    });
    await store.append({
      guildId: "guild-a",
      kind: "member_join",
      targetId: "member-2",
      summary: "second",
      at: Date.parse("2026-11-01T00:01:00.000Z"),
    });
    await store.append({
      guildId: "guild-b",
      kind: "message_edit",
      summary: "other guild",
      at: Date.parse("2026-11-01T00:02:00.000Z"),
    });

    const rows = await store.list("guild-a", 10);
    expect(rows.map((row) => row.summary)).toEqual(["second", "first"]);
    expect(rows[1]?.data).toEqual({ content: "hello" });
    expect(await store.count("guild-a")).toBe(2);
    expect(await store.count("guild-b")).toBe(1);
    await harness.close();
  });

  it("prunes only rows older than the cutoff for one guild", async () => {
    const harness = await open(await tempDir());
    const store = new DrizzleLoggingStore(harness.db);

    await store.append({
      guildId: "guild-a",
      kind: "message_delete",
      summary: "old",
      at: Date.parse("2026-10-01T00:00:00.000Z"),
    });
    await store.append({
      guildId: "guild-a",
      kind: "message_delete",
      summary: "fresh",
      at: Date.parse("2026-11-01T00:00:00.000Z"),
    });
    await store.append({
      guildId: "guild-b",
      kind: "message_delete",
      summary: "other guild old",
      at: Date.parse("2026-10-01T00:00:00.000Z"),
    });

    expect(await store.prune("guild-a", "2026-10-15T00:00:00.000Z")).toBe(1);
    expect(await store.list("guild-a", 10)).toEqual([
      expect.objectContaining({ summary: "fresh" }),
    ]);
    expect(await store.count("guild-b")).toBe(1);
    await harness.close();
  });

  it("survives a close and reopen on the same data directory", async () => {
    const dir = await tempDir();
    const first = await open(dir);
    await new DrizzleLoggingStore(first.db).append({
      guildId: "guild-a",
      kind: "moderation_action",
      actorId: "mod-1",
      targetId: "member-1",
      summary: "warned",
      data: { caseNumber: 1, action: "warn" },
      at: Date.parse("2026-11-01T00:00:00.000Z"),
    });
    await first.close();

    const second = await open(dir);
    expect(await new DrizzleLoggingStore(second.db).count("guild-a")).toBe(1);
    await second.close();
  });
});
