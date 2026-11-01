/**
 * 0008 — remove unused dashboard refresh-token fields.
 *
 * P6 stored a sealed Discord refresh token and a rotation timestamp before a
 * refresh path existed. No code ever read them, so keeping a long-lived
 * credential at rest was unnecessary risk. The session keeps only the sealed
 * access token; when it expires, the user signs in again.
 */
export const version = "0008_web_session_cleanup";

export const sql = /* sql */ `
ALTER TABLE web_sessions DROP COLUMN IF EXISTS refresh_token;
ALTER TABLE web_sessions DROP COLUMN IF EXISTS rotated_at;
`;
