/**
 * 0012 — guild events and RSVPs.
 *
 * Why a table instead of `community_records` or settings: an RSVP is relational
 * state with a per-member uniqueness rule and a capacity check that must be
 * atomic. A JSON blob cannot enforce "one row per member per event", and a
 * cached counter would drift the moment two members took the last seat. The
 * event needs a stable id for RSVPs to reference, and deleting it must cascade.
 *
 * `(event_id, user_id)` is unique, so an RSVP update is an upsert rather than a
 * second row. `state` keeps a real decline instead of deleting the row, which is
 * what lets a reminder report going and not-going counts honestly.
 */
export const version = "0012_events";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text NOT NULL DEFAULT '',
  capacity integer,
  created_by text NOT NULL,
  reminded_at timestamptz,
  reminded_by text,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS events_guild_key_idx ON events (guild_id, key);
CREATE INDEX IF NOT EXISTS events_guild_state_idx ON events (guild_id, state);
CREATE INDEX IF NOT EXISTS events_guild_starts_idx ON events (guild_id, starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  state text NOT NULL DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_user_idx
  ON event_rsvps (event_id, user_id);
CREATE INDEX IF NOT EXISTS event_rsvps_guild_event_state_idx
  ON event_rsvps (guild_id, event_id, state);
`;
