/**
 * 0006 — P6 dashboard sessions.
 *
 * Opaque session IDs are stored as SHA-256 hashes. Discord access and refresh
 * tokens are sealed with AES-256-GCM before they reach this table, so a database
 * read alone cannot replay a user's Discord authorization. No token or CSRF
 * value is stored in plaintext.
 */
export const version = "0006_web_sessions";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS web_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  username text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  csrf_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS web_sessions_expires_idx
  ON web_sessions (expires_at);
`;
