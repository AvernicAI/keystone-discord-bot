/** One escaper. Every interpolation in the dashboard goes through it. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Clip a value without splitting a surrogate pair or adding a paragraph. */
export function clip(value: string, max: number): string {
  if (max < 1) return "";
  if (value.length <= max) return value;
  const cut = value.slice(0, Math.max(0, max - 1));
  const safe = /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
  return `${safe}…`;
}

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

/** `2026-11-05 22:30 UTC`, used in footers and audit columns. */
export function timestamp(value: string | number | Date, withSeconds = false): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${withSeconds ? iso.slice(11, 19) : iso.slice(11, 16)} UTC`;
}

/** A stable, short form of a Discord id for dense tables. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}
