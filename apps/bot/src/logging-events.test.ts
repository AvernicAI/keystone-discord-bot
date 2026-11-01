import { EventEmitter } from "node:events";
import { Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createSilentLogger } from "@keystone/kernel";
import {
  InMemoryLoggingStore,
  RecordingLoggingActions,
  loggingTestSettings,
} from "@keystone/module-logging";
import { BOT_TEST_MARKER } from "./dev-fixture";
import { registerLoggingEvents } from "./logging-events";

class FakeClient extends EventEmitter {}

interface MessageFixture {
  guildId?: string;
  authorId?: string;
  bot?: boolean;
  content?: string;
  messageId?: string;
}

function message(input: MessageFixture = {}) {
  const guildId = input.guildId ?? "guild-1";
  return {
    inGuild: () => true,
    guild: { id: guildId },
    guildId,
    channelId: "channel-1",
    id: input.messageId ?? "message-1",
    content: input.content ?? "hello",
    author: { id: input.authorId ?? "author-1", bot: input.bot ?? false },
  };
}

function member(input: { bot?: boolean; joinedAt?: Date } = {}) {
  return {
    guild: { id: "guild-1" },
    id: "member-1",
    user: {
      id: "member-1",
      bot: input.bot ?? false,
      createdTimestamp: Date.now() - 3 * 86_400_000,
    },
    joinedAt: input.joinedAt ?? new Date("2026-10-01T00:00:00.000Z"),
  };
}

async function register(options: { botTestGuildId?: string } = { botTestGuildId: "dev-guild" }) {
  const client = new FakeClient();
  const store = new InMemoryLoggingStore();
  const actions = new RecordingLoggingActions();
  const settings = {
    get: async () => loggingTestSettings(),
    update: async () => loggingTestSettings(),
  };
  const stop = registerLoggingEvents(
    client as unknown as Client,
    { store, actions },
    settings,
    createSilentLogger(),
    options,
  );
  return { client, store, actions, stop };
}

describe("logging event adapter", () => {
  it("logs a marked MCP delete in the dev guild and strips the marker", async () => {
    const { client, store, actions } = await register();
    client.emit(
      Events.MessageDelete,
      message({ guildId: "dev-guild", bot: true, content: `${BOT_TEST_MARKER} log delivery` }),
    );

    await vi.waitFor(async () => expect(await store.count("dev-guild")).toBe(1));
    const [record] = await store.list("dev-guild", 10);
    expect(record?.kind).toBe("message_delete");
    expect(record?.data).toEqual({ content: "log delivery" });
    expect(actions.notices[0]?.notice.embeds?.[0]?.fields).toContainEqual({
      name: "Content",
      value: "log delivery",
      inline: false,
    });
  });

  it("ignores a bot message without the development marker", async () => {
    const { client, store } = await register();
    client.emit(
      Events.MessageDelete,
      message({ guildId: "dev-guild", bot: true, content: "not a fixture" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await store.count("guild-1")).toBe(0);
  });

  it("does not let the marker widen another guild", async () => {
    const { client, store } = await register();
    client.emit(
      Events.MessageDelete,
      message({ guildId: "production-guild", bot: true, content: `${BOT_TEST_MARKER} nope` }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await store.count("production-guild")).toBe(0);
  });

  it("records both sides of a message edit", async () => {
    const { client, store } = await register();
    client.emit(
      Events.MessageUpdate,
      message({ content: "before" }),
      message({ content: "after" }),
    );

    await vi.waitFor(async () => expect(await store.count("guild-1")).toBe(1));
    const [record] = await store.list("guild-1", 10);
    expect(record?.kind).toBe("message_edit");
    expect(record?.data).toMatchObject({ before: "before", after: "after" });
  });

  it("records member joins and leaves", async () => {
    const { client, store } = await register();
    client.emit(Events.GuildMemberAdd, member());
    client.emit(Events.GuildMemberRemove, member({ joinedAt: new Date("2026-09-01T00:00:00.000Z") }));

    await vi.waitFor(async () => expect(await store.count("guild-1")).toBe(2));
    const rows = await store.list("guild-1", 10);
    expect(rows.map((row) => row.kind).sort()).toEqual(["member_join", "member_leave"]);
    expect(rows.find((row) => row.kind === "member_join")?.data).toMatchObject({ bot: false });
  });

  it("stops listening when the returned disposer runs", async () => {
    const { client, store, stop } = await register();
    stop();
    client.emit(
      Events.MessageDelete,
      message({ guildId: "dev-guild", bot: true, content: `${BOT_TEST_MARKER} ignored` }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await store.count("guild-1")).toBe(0);
  });
});
