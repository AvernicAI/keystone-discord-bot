/**
 * 0010 — command usage.
 *
 * One row per dispatched guild command, written after the command finishes so
 * the status and duration are real. Analytics aggregates these rows; it does
 * not keep a second counter that could drift from them.
 */
export const version = "0010_command_usage";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS command_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  command text NOT NULL,
  path text NOT NULL DEFAULT '',
  status text NOT NULL,
  duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS command_usage_guild_created_idx
  ON command_usage (guild_id, created_at);

CREATE INDEX IF NOT EXISTS command_usage_guild_command_idx
  ON command_usage (guild_id, command);
`;
