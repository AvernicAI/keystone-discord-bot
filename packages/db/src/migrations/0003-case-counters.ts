/**
 * 0003 — monotonic case numbers per guild.
 *
 * The unique index on `(guild_id, case_number)` prevents duplicates, but two
 * concurrent `/mod` calls must not both choose the same next number. A counter
 * row updated with `INSERT … ON CONFLICT DO UPDATE` is atomic in Postgres and
 * keeps the number allocation in one place.
 *
 * Existing cases are seeded so a database that already has cases does not start
 * its counter at 1.
 */
export const version = "0003_case_counters";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS case_counters (
  guild_id text PRIMARY KEY,
  next_case_number integer NOT NULL DEFAULT 2
);

INSERT INTO case_counters (guild_id, next_case_number)
SELECT guild_id, COALESCE(MAX(case_number), 0) + 1
FROM cases
GROUP BY guild_id
ON CONFLICT (guild_id) DO UPDATE
SET next_case_number = GREATEST(case_counters.next_case_number, EXCLUDED.next_case_number);
`;
