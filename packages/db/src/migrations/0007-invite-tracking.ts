/**
 * 0007 — invite attribution.
 *
 * One immutable row per join, with a nullable `left_at` instead of a separate
 * leave table. The unique key includes the gateway timestamp, so a repeated
 * MEMBER_ADD delivery is idempotent without inventing a sequence. `fake_reasons`
 * is JSONB because the flags are advisory labels, not a fixed enum: adding a
 * rule must not require a migration.
 */
export const version = "0007_invite_tracking";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS invite_joins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  user_id text NOT NULL,
  inviter_id text,
  code text,
  fake_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invite_joins_guild_user_joined_idx
  ON invite_joins (guild_id, user_id, joined_at);
CREATE INDEX IF NOT EXISTS invite_joins_guild_inviter_idx
  ON invite_joins (guild_id, inviter_id);
`;
