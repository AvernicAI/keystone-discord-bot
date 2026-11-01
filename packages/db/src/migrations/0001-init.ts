/**
 * 0001 — the P1 spine.
 *
 * Every statement is `IF NOT EXISTS`, and the migrator records the version in
 * `schema_migrations` inside the same transaction, so running this twice is a
 * no-op. Later migrations append to the array; they never edit this file.
 */
export const version = "0001_init";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS guilds (
  id text PRIMARY KEY,
  name text,
  locale text NOT NULL DEFAULT 'en',
  plan text NOT NULL DEFAULT 'free',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

CREATE TABLE IF NOT EXISTS settings (
  guild_id text NOT NULL,
  module text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, module, key)
);
CREATE INDEX IF NOT EXISTS settings_guild_module_idx ON settings (guild_id, module);

CREATE TABLE IF NOT EXISTS members (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  quarantined boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  case_number integer NOT NULL,
  actor_id text NOT NULL,
  target_id text NOT NULL,
  action text NOT NULL,
  reason text,
  rule text,
  state text NOT NULL DEFAULT 'open',
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cases_guild_number_idx ON cases (guild_id, case_number);
CREATE INDEX IF NOT EXISTS cases_guild_target_idx ON cases (guild_id, target_id);
CREATE INDEX IF NOT EXISTS cases_guild_state_idx ON cases (guild_id, state);

CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events (case_id);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  opener_id text NOT NULL,
  claimer_id text,
  state text NOT NULL DEFAULT 'open',
  subject text,
  sla_due_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_guild_state_idx ON tickets (guild_id, state);

CREATE TABLE IF NOT EXISTS levels (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  xp bigint NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  user_id text NOT NULL,
  amount integer NOT NULL,
  source text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_idempotency_idx ON xp_events (idempotency_key);
CREATE INDEX IF NOT EXISTS xp_events_guild_user_idx ON xp_events (guild_id, user_id);

CREATE TABLE IF NOT EXISTS economy_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  user_id text NOT NULL,
  amount bigint NOT NULL,
  reason text NOT NULL,
  actor_id text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS economy_ledger_idempotency_idx ON economy_ledger (idempotency_key);
CREATE INDEX IF NOT EXISTS economy_ledger_guild_user_idx ON economy_ledger (guild_id, user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  actor_id text,
  action text NOT NULL,
  target_id text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_guild_idx ON audit_events (guild_id, created_at);

CREATE TABLE IF NOT EXISTS job_receipts (
  idempotency_key text PRIMARY KEY,
  job_name text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  source text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  kind text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
