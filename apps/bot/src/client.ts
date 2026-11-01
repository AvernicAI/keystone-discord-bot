import { Client, GatewayIntentBits, Partials } from "discord.js";

const INTENT_BITS = GatewayIntentBits as unknown as Record<string, number>;

/**
 * Modules declare intents by discord.js name ("GuildMembers", not `1 << 1`) so
 * the manifest stays readable. Guilds is always required: without it Discord
 * sends no guild or interaction events at all.
 */
export function resolveIntents(names: readonly string[]): GatewayIntentBits[] {
  const bits = new Set<GatewayIntentBits>([GatewayIntentBits.Guilds]);

  for (const name of names) {
    const bit = INTENT_BITS[name];
    if (typeof bit !== "number") {
      throw new Error(
        `Unknown gateway intent "${name}". Use a discord.js GatewayIntentBits key such as "GuildMembers".`,
      );
    }
    bits.add(bit as GatewayIntentBits);
  }

  return [...bits];
}

export function createClient(intents: readonly string[]): Client {
  return new Client({
    intents: resolveIntents(intents),
    partials: [Partials.Channel],
  });
}
