import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createTestContext, FakeInteraction } from "@keystone/testing";
import type { ModmailStore } from "@keystone/kernel";
import { modmail } from "./commands/modmail";
import { ModmailService } from "./modmail";
import { modmailDefaultSettings } from "./settings";
import { InMemoryModmailStore } from "./store";

function context(
  store: ModmailStore,
  options: {
    subcommand: string;
    values?: Record<string, string | number | boolean>;
    permissions?: string[];
    userId?: string;
    settings?: Record<string, unknown>;
  },
) {
  const interaction = new FakeInteraction({
    commandName: "modmail",
    subcommand: options.subcommand,
    options: options.values ?? {},
    permissions: options.permissions ?? [],
    userId: options.userId ?? "member-1",
  });
  return createTestContext({
    moduleId: "modmail",
    interaction,
    modmail: store,
    settings: options.settings ?? modmailDefaultSettings,
  });
}

async function openThread(
  store: ModmailStore,
  userId = "member-1",
  subject = "Broken role",
): Promise<string> {
  await modmail.execute(
    context(store, {
      subcommand: "open",
      userId,
      values: { subject, message: "My role disappeared after the update." },
    }),
  );
  const active = await store.getActiveThread("1", userId);
  if (!active) throw new Error("thread was not created");
  return active.id;
}

describe("/modmail privacy and lifecycle", () => {
  it("keeps a thread private to its owner and staff", async () => {
    const store = new InMemoryModmailStore();
    const threadId = await openThread(store);

    await expect(
      modmail.execute(
        context(store, {
          subcommand: "transcript",
          userId: "member-2",
          values: { thread: threadId },
        }),
      ),
    ).rejects.toThrow(/was not found/);
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "reply",
          userId: "member-2",
          values: { thread: threadId, message: "let me in" },
        }),
      ),
    ).rejects.toThrow(/was not found/);
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "close",
          userId: "member-2",
          values: { thread: threadId },
        }),
      ),
    ).rejects.toThrow(/was not found/);

    // A missing thread produces the same text, so the refusal cannot be used
    // to discover whether another member's thread exists.
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "transcript",
          userId: "member-2",
          values: { thread: "00000000-0000-4000-8000-000000000000" },
        }),
      ),
    ).rejects.toThrow(/was not found/);

    const ownerView = context(store, {
      subcommand: "transcript",
      values: { thread: threadId },
    });
    await modmail.execute(ownerView);
    expect(ownerView.interaction.lastReply?.content).toContain("1 message");
    expect(ownerView.interaction.lastReply?.embeds?.[0]?.description).toContain(
      "My role disappeared",
    );

    const staffView = context(store, {
      subcommand: "transcript",
      userId: "mod-1",
      permissions: ["ManageMessages"],
      values: { thread: threadId },
    });
    await modmail.execute(staffView);
    expect(staffView.interaction.lastReply?.content).toContain("1 message");
  });

  it("flows open → claim → transcript → close once", async () => {
    const store = new InMemoryModmailStore();
    const threadId = await openThread(store);

    const opened = await store.getThread("1", threadId);
    expect(opened).toMatchObject({
      ownerId: "member-1",
      state: "open",
      messageCount: 1,
      staffUnread: 1,
      memberUnread: 0,
    });

    const staffReply = context(store, {
      subcommand: "reply",
      userId: "mod-1",
      permissions: ["ManageMessages"],
      values: { thread: threadId, message: "Looking into it now." },
    });
    await modmail.execute(staffReply);
    const claimed = await store.getThread("1", threadId);
    expect(claimed).toMatchObject({
      state: "claimed",
      claimedBy: "mod-1",
      messageCount: 2,
      staffUnread: 1,
      memberUnread: 1,
    });
    expect(claimed?.claimedAt).toBeTruthy();

    const memberRead = context(store, {
      subcommand: "transcript",
      values: { thread: threadId },
    });
    await modmail.execute(memberRead);
    expect((await store.getThread("1", threadId))?.memberUnread).toBe(0);
    expect((await store.getThread("1", threadId))?.staffUnread).toBe(1);

    const staffRead = context(store, {
      subcommand: "transcript",
      userId: "mod-1",
      permissions: ["ManageMessages"],
      values: { thread: threadId },
    });
    await modmail.execute(staffRead);
    expect((await store.getThread("1", threadId))?.staffUnread).toBe(0);

    const closed = context(store, {
      subcommand: "close",
      values: { thread: threadId, resolution: "Role restored" },
    });
    await modmail.execute(closed);
    const thread = await store.getThread("1", threadId);
    expect(thread).toMatchObject({
      state: "closed",
      closedBy: "member-1",
      resolution: "Role restored",
      transcriptMessageCount: 2,
      memberUnread: 0,
      staffUnread: 0,
    });
    expect(thread?.closedAt).toBeTruthy();
    expect(closed.interaction.lastReply?.content).toContain("checksum");

    const archived = JSON.parse(thread?.transcript ?? "{}") as {
      format: string;
      messages: unknown[];
      counts: { messages: number };
    };
    expect(archived.format).toBe("keystone.modmail");
    expect(archived.counts).toEqual({ messages: 2 });
    expect(archived.messages).toHaveLength(2);
    expect(closed.interaction.lastReply?.embeds?.[0]?.fields?.some(
      (field) => field.name === "Checksum",
    )).toBe(true);
    expect(thread?.transcriptChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(
      createHash("sha256")
        .update(JSON.stringify(archived))
        .digest("hex"),
    ).toBe(thread?.transcriptChecksum);

    // The archived read is the stored payload, not a fresh render.
    const read = context(store, {
      subcommand: "transcript",
      values: { thread: threadId },
    });
    await modmail.execute(read);
    expect(read.interaction.lastReply?.content).toContain("archived");
    expect(read.interaction.lastReply?.embeds?.[0]?.description).toContain(
      "Looking into it now.",
    );
  });

  it("refuses replies and a second close after the thread is closed", async () => {
    const store = new InMemoryModmailStore();
    const threadId = await openThread(store);
    await modmail.execute(
      context(store, {
        subcommand: "reply",
        userId: "mod-1",
        permissions: ["ManageMessages"],
        values: { thread: threadId, message: "On it." },
      }),
    );
    await modmail.execute(
      context(store, { subcommand: "close", values: { thread: threadId } }),
    );
    const first = await store.getThread("1", threadId);

    await expect(
      modmail.execute(
        context(store, {
          subcommand: "reply",
          values: { thread: threadId, message: "one more" },
        }),
      ),
    ).rejects.toThrow(/is closed/);
    await expect(
      modmail.execute(
        context(store, { subcommand: "close", values: { thread: threadId } }),
      ),
    ).rejects.toThrow(/already closed/);

    const after = await store.getThread("1", threadId);
    expect(after?.transcriptChecksum).toBe(first?.transcriptChecksum);
    expect(after?.transcriptMessageCount).toBe(first?.transcriptMessageCount);
    expect((await store.stats("1")).messages).toBe(2);

    // A closed thread frees the member to open a new one.
    const next = await openThread(store, "member-1", "Second issue");
    expect(next).not.toBe(threadId);
    expect(await store.getActiveThread("1", "member-1")).toMatchObject({
      id: next,
      subject: "Second issue",
    });
  });

  it("allows one active thread per member but not two", async () => {
    const store = new InMemoryModmailStore();
    const threadId = await openThread(store);
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "open",
          values: { subject: "Again", message: "second" },
        }),
      ),
    ).rejects.toThrow(new RegExp(`already have an active thread .*${threadId}`));

    await openThread(store, "member-2", "Their issue");
    expect((await store.stats("1")).total).toBe(2);
    expect((await store.stats("1")).open).toBe(2);
  });

  it("enforces the staff boundary, the enabled switch and the setup write", async () => {
    const store = new InMemoryModmailStore();
    const threadId = await openThread(store);

    await expect(
      modmail.execute(context(store, { subcommand: "stats" })),
    ).rejects.toThrow(/Missing permission: ManageMessages/);
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "setup",
          values: { enabled: false },
        }),
      ),
    ).rejects.toThrow(/Missing permission: ManageGuild/);

    const setup = context(store, {
      subcommand: "setup",
      permissions: ["ManageGuild"],
      values: { enabled: false, max_threads: 5 },
    });
    await modmail.execute(setup);
    expect(await setup.settings.get("1")).toMatchObject({ enabled: false, maxThreads: 5 });
    expect(setup.interaction.lastReply?.content).toContain("disabled");

    await expect(
      modmail.execute(
        context(store, {
          subcommand: "open",
          userId: "member-3",
          settings: { ...modmailDefaultSettings, enabled: false },
          values: { subject: "Nope", message: "disabled" },
        }),
      ),
    ).rejects.toThrow(/Modmail is disabled here/);
    await expect(
      modmail.execute(
        context(store, {
          subcommand: "reply",
          settings: { ...modmailDefaultSettings, enabled: false },
          values: { thread: threadId, message: "member reply" },
        }),
      ),
    ).rejects.toThrow(/Modmail is disabled here/);

    // Staff can still drain an existing thread while the module is disabled.
    const staffReply = context(store, {
      subcommand: "reply",
      userId: "mod-1",
      permissions: ["ManageMessages"],
      settings: { ...modmailDefaultSettings, enabled: false },
      values: { thread: threadId, message: "Closing this out." },
    });
    await modmail.execute(staffReply);
    expect((await store.getThread("1", threadId))?.state).toBe("claimed");

    const stats = context(store, {
      subcommand: "stats",
      permissions: ["ManageMessages"],
    });
    await modmail.execute(stats);
    expect(stats.interaction.lastReply?.content).toContain("1 threads");
    expect(stats.interaction.lastReply?.content).toContain("2 messages");
    expect(stats.interaction.lastReply?.embeds?.[0]?.description).toContain(threadId);
    expect(stats.interaction.lastReply?.embeds?.[0]?.description).toContain("claimed");
  });

  it("enforces the thread cap, message length and message cap from settings", async () => {
    const store = new InMemoryModmailStore();
    const service = new ModmailService(
      store,
      { ...modmailDefaultSettings, maxThreads: 1 },
      () => 1_700_000_000_000,
    );
    const owner = { id: "member-1", staff: false };
    const thread = await service.open("1", owner, {
      subject: "One",
      message: "first",
    });
    await expect(
      service.open("1", { id: "member-2", staff: false }, { subject: "Two", message: "second" }),
    ).rejects.toThrow(/already has 1 mail threads/);

    const short = new ModmailService(
      store,
      { ...modmailDefaultSettings, maxMessageLength: 200 },
      () => 1_700_000_000_000,
    );
    await expect(
      short.reply("1", owner, thread.id, "x".repeat(201)),
    ).rejects.toThrow(/at most 200 characters/);

    const capped = new ModmailService(
      store,
      { ...modmailDefaultSettings, maxMessagesPerThread: 10 },
      () => 1_700_000_000_000,
    );
    for (let index = 0; index < 9; index += 1) {
      await capped.reply("1", owner, thread.id, `message ${index}`);
    }
    await expect(capped.reply("1", owner, thread.id, "one too many")).rejects.toThrow(
      /reached 10 messages/,
    );
  });
});
