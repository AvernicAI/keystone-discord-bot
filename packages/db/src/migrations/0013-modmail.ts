/**
 * 0013 — private modmail threads and their messages.
 *
 * Why tables instead of `community_records` or settings: a thread is private
 * member state with an owner, a lifecycle and an append-only conversation. The
 * database has to enforce "one active thread per member" (a partial unique
 * index on everything except `closed`) and keep the messages ordered next to
 * the thread, because the transcript is built from them and archived once.
 *
 * The transcript columns live on the thread row rather than a third table: a
 * close is one conditional update, so storing the canonical JSON, its checksum
 * and its message count in that same update makes "archived exactly once"
 * structural instead of a convention. `state <> 'closed'` on the update is the
 * backstop against a second close.
 */
export const version = "0013_modmail";

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS modmail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  owner_id text NOT NULL,
  subject text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  claimed_by text,
  claimed_at timestamptz,
  closed_by text,
  closed_at timestamptz,
  resolution text,
  member_unread integer NOT NULL DEFAULT 0,
  staff_unread integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  transcript text,
  transcript_checksum text,
  transcript_message_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS modmail_threads_active_owner_idx
  ON modmail_threads (guild_id, owner_id)
  WHERE state <> 'closed';
CREATE INDEX IF NOT EXISTS modmail_threads_guild_state_idx
  ON modmail_threads (guild_id, state, updated_at);
CREATE INDEX IF NOT EXISTS modmail_threads_guild_owner_idx
  ON modmail_threads (guild_id, owner_id);

CREATE TABLE IF NOT EXISTS modmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  thread_id uuid NOT NULL REFERENCES modmail_threads(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  side text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS modmail_messages_thread_idx
  ON modmail_messages (thread_id, created_at);
`;
