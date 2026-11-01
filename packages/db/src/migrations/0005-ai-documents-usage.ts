/**
 * 0005 — P4 AI documents and aggregate usage.
 *
 * The vectors are stored inside the chunk JSON for portability: PGlite has no
 * pgvector extension, and the module's exact-cosine index is the reference
 * implementation. No prompt or completion column exists. `cost_micros` is an
 * integer so a budget cannot drift through floating-point accumulation.
 */
export const version = "0005_ai_documents_usage";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS ai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_documents_guild_idx
  ON ai_documents (guild_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage (
  guild_id text NOT NULL,
  period text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, period)
);
`;
