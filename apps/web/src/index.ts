import "dotenv/config";
import { createServer } from "node:http";
import { loadEnv } from "@keystone/config";
import { createWebRuntime } from "./runtime";

async function main(): Promise<void> {
  const env = loadEnv();
  const runtime = createWebRuntime(env);
  const server = createServer(runtime.handler);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.WEB_PORT, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  runtime.logger.info("web ready", {
    port: env.WEB_PORT,
    database: runtime.mode.database,
    oauth: runtime.mode.oauth,
    secureCookies: runtime.mode.secureCookies,
    ephemeralSessionKey: runtime.ephemeralSessionKey,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    runtime.logger.info("web shutting down", { signal });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
