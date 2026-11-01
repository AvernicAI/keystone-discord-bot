/**
 * Development-only fixture seam for bot-authored messages.
 *
 * The Discord MCP is a bot, so ordinary message events ignore it. In one
 * configured development guild a marker lets it drive the real event path
 * without a second human account. Production passes no guild id, so the seam
 * cannot widen there.
 */
export const BOT_TEST_MARKER = "keystone-test:";

export interface FixtureMessage {
  readonly content: string;
  readonly guildId: string | null;
  readonly author: { readonly bot: boolean };
}

/**
 * Return the stripped fixture content when this is a marker-prefixed bot
 * message in the configured development guild; otherwise undefined.
 */
export function botFixtureContent(
  message: FixtureMessage,
  botTestGuildId: string | undefined,
): string | undefined {
  if (!botTestGuildId || !message.author.bot) return undefined;
  if (message.guildId !== botTestGuildId) return undefined;
  if (!message.content.startsWith(BOT_TEST_MARKER)) return undefined;
  const content = message.content.slice(BOT_TEST_MARKER.length).trim();
  return content.length > 0 ? content : undefined;
}
