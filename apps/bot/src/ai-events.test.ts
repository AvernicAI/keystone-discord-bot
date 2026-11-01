import { EventEmitter } from "node:events";
import { Events, type Client, type Message } from "discord.js";
import { createSilentLogger, type AiPort } from "@keystone/kernel";
import { describe, expect, it, vi } from "vitest";
import { registerAiEvents } from "./ai-events";

const GUILD = "1450130465146142785";
const BOT = "1549086192794992710";
const TEST_BOT = "1493685079468146808";

function harness() {
  const client = Object.assign(new EventEmitter(), {
    user: { id: BOT },
  }) as unknown as Client;
  const chat = vi.fn(async () => ({
    text: "A test answer.",
    sources: [],
    model: "test",
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
  }));
  const ai = { chat } as unknown as AiPort;
  return { client, ai, chat };
}

function emit(client: Client, eventMessage: Message): void {
  (client as unknown as EventEmitter).emit(Events.MessageCreate, eventMessage);
}

function message(authorId: string, isBot: boolean, guildId = GUILD): Message {
  return {
    author: { id: authorId, bot: isBot },
    guildId,
    content: `<@${BOT}> hello`,
    mentions: { has: () => true },
    reply: vi.fn(async () => undefined),
  } as unknown as Message;
}

describe("AI mention events", () => {
  it("ignores an ordinary bot author even when it mentions the bot", async () => {
    const { client, ai, chat } = harness();
    registerAiEvents(client, ai, createSilentLogger());
    emit(client, message(TEST_BOT, true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chat).not.toHaveBeenCalled();
  });

  it("allows bot authors only in the configured development guild", async () => {
    const { client, ai, chat } = harness();
    registerAiEvents(client, ai, createSilentLogger(), { allowBotsInGuildId: GUILD });
    emit(client, message(TEST_BOT, true));
    await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
  });

  it("does not extend the development seam to another guild", async () => {
    const { client, ai, chat } = harness();
    registerAiEvents(client, ai, createSilentLogger(), { allowBotsInGuildId: GUILD });
    emit(client, message(TEST_BOT, true, "111111111111111111"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chat).not.toHaveBeenCalled();
  });

  it("still ignores a bot author in the test guild while the option is absent", async () => {
    const { client, ai, chat } = harness();
    registerAiEvents(client, ai, createSilentLogger(), {});
    emit(client, message(TEST_BOT, true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chat).not.toHaveBeenCalled();
  });
});
