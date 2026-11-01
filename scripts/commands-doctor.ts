import "dotenv/config";
import { ModuleRegistry } from "@keystone/kernel";
import { buildCommandJson } from "../apps/bot/src/adapt";
import { commandDrift, hasDrift, type CommandJson } from "../apps/bot/src/command-sync";
import { modules } from "../apps/bot/src/modules";

/**
 * Read-only command registration doctor.
 *
 * The common confusion after a kick/re-invite is "the bot only has 11
 * commands". Global commands belong to the application, not to guild
 * membership, so this prints what Discord actually has and the exact invite
 * scope needed to use them. It never prints the token.
 */
const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is not set. Copy .env.example to .env first.");
}

const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${path} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

const registry = new ModuleRegistry().registerAll(modules);
const catalog = registry.catalog();
const payload = registry.listCommands().map((command) => buildCommandJson(command.definition));
const app = await get<{ id: string; name: string; approximate_guild_count?: number }>(
  "/applications/@me",
);
const commands = await get<CommandJson[]>(`/applications/${app.id}/commands`);
const guilds = await get<Array<{ id: string; name: string }>>("/users/@me/guilds");
const drift = commandDrift(payload as unknown as CommandJson[], commands);
const names = commands.map((command) => command.name).sort();
const invite = `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot%20applications.commands`;
const countSubcommands = (list: readonly CommandJson[]): number =>
  list.reduce(
    (sum, command) =>
      sum +
      (command.options ?? []).reduce(
        (inner, option) =>
          inner +
          (option.type === 1 ? 1 : 0) +
          (option.type === 2 ? (option.options ?? []).length : 0),
        0,
      ),
    0,
  );

console.log(`Application  ${app.name} (${app.id})`);
console.log(`Guilds       ${guilds.length}: ${guilds.map((guild) => `${guild.name} (${guild.id})`).join(", ") || "none"}`);
console.log(`Registry     ${registry.commandCount} roots · ${catalog.reduce((sum, entry) => sum + entry.subcommands.length, 0)} subcommands`);
console.log(`Discord      ${names.length} global chat-input commands · ${countSubcommands(commands)} subcommands`);
console.log(`Names        ${names.join(", ") || "none"}`);
if (drift.missing.length > 0) console.log(`Missing      ${drift.missing.join(", ")}`);
if (drift.extra.length > 0) console.log(`Extra        ${drift.extra.join(", ")}`);
if (drift.changed.length > 0) console.log(`Changed      ${drift.changed.join(", ")} (options or subcommand tree differs)`);
if (hasDrift(drift)) {
  console.log("Drift detected. Run `pnpm commands:resync` once, then re-run this doctor.");
}
if (process.env.DEV_GUILD_ID) {
  const present = guilds.some((guild) => guild.id === process.env.DEV_GUILD_ID);
  console.log(`DEV_GUILD_ID ${process.env.DEV_GUILD_ID}: ${present ? "bot is a member" : "BOT IS NOT A MEMBER"}`);
}
console.log("");
console.log("If the commands do not appear, re-install with both scopes:");
console.log(`  ${invite}`);
console.log("Discord caps global bulk overwrites at two per ten minutes; run resync deliberately.");
