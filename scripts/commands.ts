import "dotenv/config";
import { ModuleRegistry } from "@keystone/kernel";
import { modules } from "../apps/bot/src/modules";
import { buildCommandJson } from "../apps/bot/src/adapt";
import { commandDrift, hasDrift, type CommandJson } from "../apps/bot/src/command-sync";

/**
 * Explicit slash-command sync.
 *
 * Discord's bulk overwrite replaces the whole global command set, so the bot
 * only writes at boot when the server set has drifted. This script is the
 * deliberate clear-then-register cycle for a payload-only change (description,
 * options) or for a manually forced resync:
 *
 *   pnpm commands:sync      # atomic replace, no clear
 *   pnpm commands:resync    # clear, then register, then read back
 *
 * It never prints the token. Discord limits bulk overwrites to two per ten
 * minutes, so running `commands:resync` twice in a row can wait for the window.
 */

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is not set. Copy .env.example to .env first.");

const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
const clear = process.argv.includes("--clear");

const me = await fetch(`${API}/applications/@me`, { headers });
if (!me.ok) throw new Error(`Could not read the application: HTTP ${me.status}`);
const application = (await me.json()) as { id: string };
const url = `${API}/applications/${application.id}/commands`;

async function discord(method: string, body?: unknown, attempts = 4): Promise<unknown> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429) {
      const payload = (await response.json()) as { retry_after?: number };
      const waitMs = Math.min(60_000, Math.max(1_000, Math.ceil((payload.retry_after ?? 5) * 1_000)));
      console.log(`rate limited; waiting ${Math.ceil(waitMs / 1_000)}s (attempt ${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${url.split("/").at(-1)} failed: HTTP ${response.status} ${text}`);
    }
    return response.json();
  }
  throw new Error("Discord kept rate limiting the command sync; try again later.");
}

const registry = new ModuleRegistry().registerAll(modules);
const payload = registry.listCommands().map((command) => buildCommandJson(command.definition));

if (clear) {
  const before = (await discord("GET")) as Array<{ name: string }>;
  console.log(`server has ${before.length}: ${before.map((command) => command.name).join(", ")}`);
  await discord("PUT", []);
  console.log("cleared");
  await discord("PUT", payload);
  console.log(`registered ${payload.length}`);
} else {
  await discord("PUT", payload);
  console.log(`registered ${payload.length}`);
}

const after = (await discord("GET")) as CommandJson[];
const drift = commandDrift(payload as unknown as CommandJson[], after);
console.log(`server now has ${after.length}: ${after.map((command) => command.name).join(", ")}`);
if (hasDrift(drift)) {
  throw new Error(
    `command sync mismatch: missing ${drift.missing.join(", ") || "none"}; extra ${drift.extra.join(", ") || "none"}; changed ${drift.changed.join(", ") || "none"}`,
  );
}
console.log("command sync verified (names and subcommand shape)");
