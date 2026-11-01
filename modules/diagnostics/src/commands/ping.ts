import { cooldown, defineCommand } from "@keystone/kernel";
import { formatDuration } from "../format";

export const ping = defineCommand({
  name: "ping",
  description: "Check that Keystone is awake.",
  guards: [cooldown(3_000)],
  async execute(ctx) {
    const uptime = formatDuration(process.uptime() * 1000);
    await ctx.interaction.reply({ content: `Pong! Keystone has been up for ${uptime}.` });
  },
  notes:
    "The smallest possible command: one guard, one reply, no dependencies. Start here when reading the codebase.",
});
