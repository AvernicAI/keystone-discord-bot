/**
 * 0004 — P3 community records.
 *
 * Levels, XP events, the economy ledger and tickets already live in the P1/P2
 * spine. P3 adds one generic record table for owned feature state that has no
 * stable SQL shape yet: reaction-role panels, starboard entries, giveaways,
 * tags, embeds, reminders, feeds, stat channels and ticket transcript events.
 *
 * The key is scoped by guild and kind, so one guild cannot read another's
 * records even if it guesses a key. Data is JSONB for the same round-trip
 * reasons as settings.
 */
export const version = "0004_community_records";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS community_records (
  guild_id text NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, kind, key)
);
CREATE INDEX IF NOT EXISTS community_records_guild_kind_idx
  ON community_records (guild_id, kind);
`;
