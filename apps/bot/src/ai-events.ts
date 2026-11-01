import { Events, type Client, type Message } from "discord.js";
import { UserError, type AiPort, type Logger } from "@keystone/kernel";

/**
 * Mention-only chat.
 *
 * The module policy is checked inside AiPort, so a disabled or capped guild
 * never reaches the provider. The event deliberately ignores bots, DMs and
 * messages without a usable mention, and replies without mentioning the author
 * back.
 */
export function registerAiEvents(client: Client, ai: AiPort, logger: Logger): () => void {
  const onMessage = (message: Message): void => {
    if (message.author.bot || !message.guildId || !client.user) return;
    if (!message.mentions.has(client.user)) return;
    const question = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();
    if (!question) return;

    void (async () => {
      try {
        const answer = await ai.chat(message.guildId as string, message.author.id, question);
        await message.reply({
          content: answer.text.slice(0, 1_900),
          allowedMentions: { repliedUser: false },
        });
      } catch (error) {
        if (error instanceof UserError) return; // Disabled/capped: stay silent.
        logger.error("mention chat failed", {
          guildId: message.guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  client.on(Events.MessageCreate, onMessage);
  return () => client.off(Events.MessageCreate, onMessage);
}
