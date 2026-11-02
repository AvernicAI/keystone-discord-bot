/**
 * 0011 — forms and submissions.
 *
 * Why a table instead of `community_records`: a submission is mutable state with
 * a review transition and a per-member uniqueness rule. Storing it in the
 * generic record table would make the forms module borrow the community
 * module's store, and could not enforce "one pending submission per member per
 * form" in the database. Forms themselves are rows, not settings, because every
 * submission references a stable id.
 *
 * The partial unique index only covers `submitted`, so a double click cannot
 * create two review items while a denied applicant can apply again later.
 */
export const version = "0011_forms";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  fields jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  panel_channel_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS forms_guild_key_idx ON forms (guild_id, key);
CREATE INDEX IF NOT EXISTS forms_guild_state_idx ON forms (guild_id, state);

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  answers jsonb NOT NULL,
  state text NOT NULL DEFAULT 'submitted',
  reviewed_by text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_submissions_guild_form_idx
  ON form_submissions (guild_id, form_id, created_at);
CREATE INDEX IF NOT EXISTS form_submissions_guild_user_idx
  ON form_submissions (guild_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_pending_idx
  ON form_submissions (form_id, user_id)
  WHERE state = 'submitted';
`;
