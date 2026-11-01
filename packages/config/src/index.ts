import { z } from "zod";

/** Empty strings from a copied .env count as "not set". */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const booleanFlag = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return false;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DISCORD_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(20).optional(),
  ),
  DATABASE_URL: optionalString,
  REDIS_URL: optionalString,
  /** BullMQ queue name. Separate from any other Redis usage. */
  QUEUE_NAME: z.string().min(1).default("keystone"),
  /**
   * `full` requests optional privileged intents (welcome, scanner, transcripts).
   * `minimal` requests only non-privileged intents and reports the lost features.
   * The Developer Portal must have the matching intents enabled or login fails
   * with close code 4014.
   */
  INTENT_PROFILE: z.enum(["minimal", "full"]).default("full"),
  /** Tracing is opt-in; with neither flag nor endpoint it costs nothing. */
  OTEL_ENABLED: booleanFlag.default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
  /** Optional OpenAI-compatible provider. All values are server-side. */
  AI_API_KEY: optionalString,
  AI_BASE_URL: optionalString,
  AI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  AI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  AI_INPUT_USD_PER_MILLION: z.coerce.number().min(0).default(0.15),
  AI_OUTPUT_USD_PER_MILLION: z.coerce.number().min(0).default(0.6),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export function requireToken(env: Env): string {
  if (!env.DISCORD_TOKEN) {
    throw new Error(
      "DISCORD_TOKEN is not set. Copy .env.example to .env and paste your bot token.",
    );
  }
  return env.DISCORD_TOKEN;
}
