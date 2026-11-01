import { EventEmitter } from "node:events";
import { Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createSilentLogger } from "@keystone/kernel";
import { BOT_TEST_MARKER, registerModerationEvents } from "./moderation-events";

class FakeClient extends EventEmitter {}

interface MessageFixture {
  guildId?: string;
  authorId?: string;
  bot?: boolean;
  content?: string;
}

function message(input: MessageFixture = {}) {
  return {
    inGuild: () => true,
    guild: { id: input.guildId ?? "guild-1" },
    channelId: "channel-1",
    id: "message-1",
    author: { id: input.authorId ?? "author-1", bot: input.bot ?? false },
    content: input.content ?? "hello",
  };
}

function register(botTestGuildId?: string) {
  const client = new FakeClient();
  const handle = vi.fn().mockResolvedValue({
    findings: [],
    cases: [],
    dryRun: true,
    actionResults: [],
  });
  registerModerationEvents(
    client as unknown as Client,
    { handle } as never,
    createSilentLogger(),
    { botTestGuildId },
  );
  return { client, handle };
}

describe("moderation event adapter", () => {
  it("ignores a bot message without the development marker", () => {
    const { client, handle } = register("dev-guild");
    client.emit(
      Events.MessageCreate,
      message({ guildId: "dev-guild", bot: true, content: "https://phish.test/login" }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it("evaluates a marker-prefixed bot message only in the development guild", () => {
    const { client, handle } = register("dev-guild");
    client.emit(
      Events.MessageCreate,
      message({
        guildId: "dev-guild",
        bot: true,
        content: `${BOT_TEST_MARKER} https://login.phish.test/verify`,
      }),
    );
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]?.[0]).toMatchObject({
      type: "message.create",
      guildId: "dev-guild",
      content: "https://login.phish.test/verify",
      isBot: false,
    });
  });

  it("does not let the marker widen another guild", () => {
    const { client, handle } = register("dev-guild");
    client.emit(
      Events.MessageCreate,
      message({
        guildId: "production-guild",
        bot: true,
        content: `${BOT_TEST_MARKER} https://phish.test/login`,
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it("keeps scanning ordinary member messages", () => {
    const { client, handle } = register("dev-guild");
    client.emit(Events.MessageCreate, message({ content: "hello there" }));
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello there", isBot: false }),
    );
  });
});
