import "dotenv/config";
import { loadEnv } from "@keystone/config";
import { createPostgresDatabase, migrate } from "@keystone/db";

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations. Copy .env.example to .env first.");
  }

  const database = createPostgresDatabase(env.DATABASE_URL);
  try {
    const result = await migrate(database.runner);
    if (result.applied.length === 0) {
      console.log(`Migrations already up to date (${result.alreadyApplied.join(", ") || "none"}).`);
    } else {
      console.log(`Applied migration(s): ${result.applied.join(", ")}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  const detail =
    error instanceof Error
      ? error.stack || error.message || error.name
      : String(error);
  console.error(detail);
  process.exit(1);
});
