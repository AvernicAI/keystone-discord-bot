/**
 * Canonical JSON is the checksum's contract.
 *
 * `JSON.stringify` preserves insertion order, so the same data built by two
 * different code paths can hash differently. Sorting object keys (and not
 * array order) gives a checksum that means "this content", not "this object
 * literal". The export format therefore never depends on key order.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot hash a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(",")}}`;
  }
  // undefined and functions are not valid JSON; omitting them keeps the hash
  // aligned with what a JSON round-trip would see.
  return "null";
}
