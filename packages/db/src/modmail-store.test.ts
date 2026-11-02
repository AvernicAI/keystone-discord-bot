import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleModmailStore } from "./modmail-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function store(): Promise<{ store: DrizzleModmailStore; harness: PgliteHarness }> {
  const created = await createMigratedPglite();
  return { store: new DrizzleModmailStore(created.db), harness: created };
}

async function createThread(
  store: DrizzleModmailStore,
  overrides: { guildId?: string; ownerId?: string; subject?: string } = {},
) {
  const result = await store.createThread({
    guildId: overrides.guildId ?? "guild-a",
    ownerId: overrides.ownerId ?? "member-1",
    subject: overrides.subject ?? "Broken role",
    body: "My role disappeared after the update.",
    authorId: overrides.ownerId ?? "member-1",
  });
  if (!result.ok) throw new Error("unexpected active thread");
  return result.thread;
}

describe("SQL modmail store", () => {
  it("stores one thread and its first message, and refuses a second active thread", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createThread(setup.store);

    expect(await setup.store.getThread("guild-a", created.id)).toMatchObject({
      ownerId: "member-1",
      state: "open",
      messageCount: 1,
      staffUnread: 1,
      memberUnread: 0,
    });
    expect(await setup.store.getThread("guild-b", created.id)).toBeUndefined();

    const duplicate = await setup.store.createThread({
      guildId: "guild-a",
      ownerId: "member-1",
      subject: "Again",
      body: "second",
      authorId: "member-1",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.reason).toBe("active-exists");
      expect(duplicate.thread.id).toBe(created.id);
    }

    const threads = await harness.runner.query<{ count: string }>(
      "select count(*)::text as count from modmail_threads",
    );
    expect(threads[0]?.count).toBe("1");
    const messages = await harness.runner.query<{ body: string; side: string }>(
      "select body, side from modmail_messages",
    );
    expect(messages).toEqual([
      { body: "My role disappeared after the update.", side: "member" },
    ]);
  });

  it("claims on the first staff reply and tracks unread per side", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createThread(setup.store);

    const staff = await setup.store.appendMessage({
      guildId: "guild-a",
      threadId: created.id,
      authorId: "mod-1",
      side: "staff",
      body: "Looking into it.",
    });
    expect(staff.ok).toBe(true);
    if (staff.ok) {
      expect(staff.thread).toMatchObject({
        state: "claimed",
        claimedBy: "mod-1",
        messageCount: 2,
        memberUnread: 1,
        staffUnread: 1,
      });
    }

    const member = await setup.store.appendMessage({
      guildId: "guild-a",
      threadId: created.id,
      authorId: "member-1",
      side: "member",
      body: "Thank you.",
    });
    expect(member.ok).toBe(true);
    if (member.ok) {
      expect(member.thread).toMatchObject({
        state: "claimed",
        messageCount: 3,
        memberUnread: 1,
        staffUnread: 2,
      });
    }

    await setup.store.markRead("guild-a", created.id, "member");
    await setup.store.markRead("guild-a", created.id, "staff");
    expect(await setup.store.getThread("guild-a", created.id)).toMatchObject({
      memberUnread: 0,
      staffUnread: 0,
    });

    const rows = await harness.runner.query<{
      state: string;
      claimed_by: string;
      message_count: number;
      member_unread: number;
      staff_unread: number;
    }>(
      `select state, claimed_by, message_count, member_unread, staff_unread
       from modmail_threads where id = '${created.id}'`,
    );
    expect(rows).toEqual([
      {
        state: "claimed",
        claimed_by: "mod-1",
        message_count: 3,
        member_unread: 0,
        staff_unread: 0,
      },
    ]);

    const messages = await setup.store.listMessages("guild-a", created.id);
    expect(messages.map((message) => message.side)).toEqual([
      "member",
      "staff",
      "member",
    ]);
  });

  it("archives the transcript once and refuses a second close", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await createThread(setup.store);
    await setup.store.appendMessage({
      guildId: "guild-a",
      threadId: created.id,
      authorId: "mod-1",
      side: "staff",
      body: "Fixed it.",
    });

    const transcript = JSON.stringify({
      format: "keystone.modmail",
      version: 1,
      messages: [],
    });
    const closed = await setup.store.closeThread({
      guildId: "guild-a",
      threadId: created.id,
      closedBy: "mod-1",
      resolution: "Role restored",
      transcript,
      transcriptChecksum: "abc123",
      transcriptMessageCount: 2,
      at: "2026-11-01T12:00:00.000Z",
    });
    expect(closed).toMatchObject({
      state: "closed",
      closedBy: "mod-1",
      resolution: "Role restored",
      transcript,
      transcriptChecksum: "abc123",
      transcriptMessageCount: 2,
    });

    const second = await setup.store.closeThread({
      guildId: "guild-a",
      threadId: created.id,
      closedBy: "mod-2",
      transcript: JSON.stringify({ second: true }),
      transcriptChecksum: "second",
      transcriptMessageCount: 99,
      at: "2026-11-02T12:00:00.000Z",
    });
    expect(second).toBeUndefined();

    const rows = await harness.runner.query<{
      state: string;
      transcript_checksum: string;
      transcript_message_count: number;
      closed_by: string;
    }>(
      `select state, transcript_checksum, transcript_message_count, closed_by
       from modmail_threads where id = '${created.id}'`,
    );
    expect(rows).toEqual([
      {
        state: "closed",
        transcript_checksum: "abc123",
        transcript_message_count: 2,
        closed_by: "mod-1",
      },
    ]);

    const appended = await setup.store.appendMessage({
      guildId: "guild-a",
      threadId: created.id,
      authorId: "member-1",
      side: "member",
      body: "one more",
    });
    expect(appended).toEqual({ ok: false, reason: "closed" });

    // The partial unique index only covers active threads, so a closed thread
    // frees the member to open a new one.
    const next = await createThread(setup.store, { subject: "Second issue" });
    expect(next.id).not.toBe(created.id);
    expect(await setup.store.getActiveThread("guild-a", "member-1")).toMatchObject({
      id: next.id,
    });
  });

  it("reports guild-scoped stats from the rows", async () => {
    const setup = await store();
    harness = setup.harness;
    const first = await createThread(setup.store);
    await createThread(setup.store, { ownerId: "member-2" });
    await createThread(setup.store, { guildId: "guild-b", ownerId: "member-3" });
    await setup.store.closeThread({
      guildId: "guild-a",
      threadId: first.id,
      closedBy: "member-1",
      transcript: "{}",
      transcriptChecksum: "abc",
      transcriptMessageCount: 1,
      at: "2026-11-01T12:00:00.000Z",
    });

    expect(await setup.store.stats("guild-a")).toEqual({
      total: 2,
      open: 1,
      claimed: 0,
      closed: 1,
      messages: 2,
      staffUnread: 1,
    });
    expect(await setup.store.stats("guild-b")).toEqual({
      total: 1,
      open: 1,
      claimed: 0,
      closed: 0,
      messages: 1,
      staffUnread: 1,
    });
  });
});
