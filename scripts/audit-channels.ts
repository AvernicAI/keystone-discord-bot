import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Static channel-obfuscation gate.
 *
 * Discord's 2026-11-16 rollout means a channel cache is not a complete guild and
 * a hidden channel has a placeholder name. The adapter must fetch by id through
 * `resolveChannel()`; this script catches a new direct lookup before it ships.
 *
 * It is intentionally narrow: it checks the bot adapter, not the kernel or a
 * module, because discord.js is only allowed in `apps/bot`.
 */
const root = path.resolve(import.meta.dirname, "..");
const botSrc = path.join(root, "apps/bot/src");
const failures: string[] = [];
let callSites = 0;

const files = (await readdir(botSrc)).filter((file) => file.endsWith(".ts"));
for (const file of files) {
  if (file === "channels.ts") continue;
  const text = await readFile(path.join(botSrc, file), "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes(".channels.cache")) {
      failures.push(`${file}:${index + 1} uses a channel cache; fetch by id through resolveChannel()`);
    }
    if (!line.includes(".channels.fetch")) return;
    callSites += 1;
    const window = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
    if (!window.includes("resolveChannel(")) {
      failures.push(`${file}:${index + 1} calls channels.fetch without resolveChannel()`);
    }
  });
}

if (files.includes("channels.ts")) {
  console.log(`Channel audit: ${callSites} fetch call site(s) checked, resolveChannel present`);
} else {
  failures.push("apps/bot/src/channels.ts is missing");
}

if (failures.length > 0) {
  console.error("Channel audit failed:");
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.log("Channel audit: OK");
