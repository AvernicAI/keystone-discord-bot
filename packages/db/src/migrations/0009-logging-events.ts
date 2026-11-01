/**
 * 0009 — audit logging.
 *
 * An event row is written before delivery, so a broken or deleted channel does
 * not lose the audit trail. `created_at` is the gateway event time, which makes
 * retention deterministic even when the bot was offline and later replayed a
 * queued event. Message content is deliberately nullable: a cache miss still
 * produces an event with an ID and an explicit "content unavailable" render.
 */
export const version = "0009_logging_events";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS logging_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  kind text NOT NULL,
  actor_id text,
  target_id text,
  channel_id text,
  message_id text,
  summary text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logging_events_guild_created_idx
  ON logging_events (guild_id, created_at);
`;
