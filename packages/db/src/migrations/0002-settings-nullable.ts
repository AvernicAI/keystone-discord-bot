/**
 * 0002 — allow a JSON null value.
 *
 * Drizzle converts a JS `null` to SQL NULL before a column mapper can run, so a
 * NOT NULL constraint rejects a legitimate JSON null. The key still exists
 * because the row exists; the value is simply null.
 *
 * 0001 is not edited: applied migrations are history, and changing them makes
 * two databases with the same version disagree.
 */
export const version = "0002_settings_nullable";

export const sql = /* sql */ `
ALTER TABLE settings ALTER COLUMN value DROP NOT NULL;
`;
