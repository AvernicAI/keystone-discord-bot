/**
 * 0021 — the channel an event's interactive panel was posted to.
 *
 * A reminder fired by the 60-second tick has no interaction to reply to, so the
 * announcement's channel has to live on the event row. A second record keyed by
 * event id would be a second source of truth for an event's audience and would
 * drift the moment an event was deleted or re-opened elsewhere.
 *
 * Nullable on purpose: events opened before this pass have no panel channel and
 * therefore get no automatic reminder. `/event remind` still posts one.
 */
export const version = "0021_event_panel";

export const sql = /* sql */ `
ALTER TABLE events ADD COLUMN IF NOT EXISTS panel_channel_id text;
`;
