import { z } from "zod";

/**
 * Level importers are intentionally permissive about column names and strict
 * about ids and numbers. Every modern level bot exports some spelling of
 * `user_id` + `xp`; accepting the common variants is cheaper than asking an
 * admin to hand-edit five thousand rows, while a non-snowflake id is refused
 * before it becomes a settings value.
 */
export interface LevelImportRow {
  readonly userId: string;
  readonly xp: number;
  readonly sourceLevel?: number;
}

export interface LevelImport {
  readonly source: string;
  readonly rows: readonly LevelImportRow[];
  readonly warnings: readonly string[];
  readonly skipped: number;
}

export interface LevelImportInput {
  readonly filename: string;
  readonly content: string;
}

const SNOWFLAKE = /^\d{15,22}$/;
const MAX_ROWS = 200_000;

const looseLevelRow = z.record(z.unknown());

export function keystoneLevelForXp(xp: number): number {
  return Math.max(0, Math.floor(xp / 100));
}

export function parseLevelsFile(input: LevelImportInput): LevelImport {
  const lower = input.filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return parseDelimited(input);
  }
  if (lower.endsWith(".json") || input.content.trimStart().startsWith("{") || input.content.trimStart().startsWith("[")) {
    return parseJsonLevels(input);
  }
  throw new Error("Unsupported level file. Use a JSON or CSV export.");
}

export function parseMee6(payload: unknown): LevelImport {
  const parsed = z
    .object({ players: z.array(looseLevelRow) })
    .passthrough()
    .safeParse(payload);
  if (!parsed.success) {
    throw new Error("This is not a MEE6 leaderboard response (expected `players[]`).");
  }
  return normalize("mee6", parsed.data.players, {
    idKeys: ["id"],
    xpKeys: ["xp"],
    levelKeys: ["level"],
  });
}

export function parseJsonLevels(input: LevelImportInput): LevelImport {
  let payload: unknown;
  try {
    payload = JSON.parse(input.content);
  } catch (error) {
    throw new Error(`Level file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (isRecord(payload) && Array.isArray(payload.players)) {
    return parseMee6(payload);
  }

  const source = detectSource(payload);
  const rows = extractArray(payload);
  if (!rows) {
    throw new Error(
      "Could not find a rows array. Expected an array or one of `levels`, `users`, `members`, `data`, `leaderboard`.",
    );
  }
  return normalize(source, rows, {
    idKeys: ["userId", "user_id", "id", "memberId", "member_id", "discordId", "discord_id"],
    xpKeys: ["xp", "totalXp", "total_xp", "experience", "points", "score"],
    levelKeys: ["level", "levelNumber", "level_number"],
  });
}

export function parseDelimited(input: LevelImportInput): LevelImport {
  const delimiter = input.filename.toLowerCase().endsWith(".tsv") || !input.content.includes(",") ? "\t" : ",";
  const rows = parseTable(input.content, delimiter);
  if (rows.length < 2) throw new Error("Delimited file needs a header and at least one data row.");
  const header = (rows[0] ?? []).map((cell) => cell.trim());
  const normalizedHeader = header.map((cell) => normalizeHeader(cell));
  const records = rows.slice(1).map((cells) => {
    const record: Record<string, unknown> = {};
    normalizedHeader.forEach((key, index) => {
      record[key] = cells[index] ?? null;
    });
    return record;
  });
  return normalize("generic-csv", records, {
    idKeys: ["userid", "user_id", "id", "memberid", "member_id", "discordid", "discord_id"],
    xpKeys: ["xp", "totalxp", "total_xp", "experience", "points", "score"],
    levelKeys: ["level", "levelnumber", "level_number"],
  });
}

export function levelImportToFixture(imported: LevelImport): { source: string; levels: LevelImportRow[] } {
  return { source: imported.source, levels: [...imported.rows] };
}

/** Explicitly refuse the sources whose terms prohibit scraping. */
export function assertFileSourceIsAllowed(source: string): void {
  if (["arcane-scrape", "mee6-scrape", "polaris-api"].includes(source)) {
    throw new Error(
      "That source is not supported: use a user-supplied export file instead of scraping a vendor.",
    );
  }
}

function normalize(
  source: string,
  rows: readonly Record<string, unknown>[],
  keys: { idKeys: readonly string[]; xpKeys: readonly string[]; levelKeys: readonly string[] },
): LevelImport {
  const byUser = new Map<string, LevelImportRow>();
  const warnings: string[] = [];
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    if (index >= MAX_ROWS) {
      warnings.push(`Stopped at ${MAX_ROWS} rows; split the file for larger imports.`);
      break;
    }
    const userId = readId(row, keys.idKeys);
    if (!userId) {
      skipped += 1;
      continue;
    }
    if (!SNOWFLAKE.test(userId)) {
      skipped += 1;
      if (warnings.length < 10) warnings.push(`Skipped row ${index + 1}: \`${userId}\` is not a Discord user id.`);
      continue;
    }

    const parsedXp = readNumber(row, keys.xpKeys);
    const parsedLevel = readNumber(row, keys.levelKeys);
    if (parsedXp === undefined && parsedLevel === undefined) {
      skipped += 1;
      if (warnings.length < 10) warnings.push(`Skipped row ${index + 1}: no XP or level column.`);
      continue;
    }
    const xp = parsedXp ?? Math.max(0, parsedLevel ?? 0) * 100;
    if (!Number.isFinite(xp) || xp < 0) {
      skipped += 1;
      if (warnings.length < 10) warnings.push(`Skipped row ${index + 1}: XP is not a non-negative number.`);
      continue;
    }

    const candidate: LevelImportRow = {
      userId,
      xp: Math.floor(xp),
      ...(parsedLevel !== undefined ? { sourceLevel: Math.floor(parsedLevel) } : {}),
    };
    const existing = byUser.get(userId);
    if (existing && existing.xp >= candidate.xp) {
      skipped += 1;
      continue;
    }
    if (existing) {
      skipped += 1;
      warnings.push(`Duplicate ${userId}: kept the higher XP value.`);
    }
    byUser.set(userId, candidate);
  }

  return { source, rows: [...byUser.values()], warnings, skipped };
}

function extractArray(payload: unknown): Record<string, unknown>[] | undefined {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return undefined;
  for (const key of ["levels", "users", "members", "data", "leaderboard", "rows"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return undefined;
}

function detectSource(payload: unknown): string {
  if (!isRecord(payload)) return "generic-json";
  const declared = String(payload.source ?? payload.bot ?? payload.provider ?? "").toLowerCase();
  if (declared.includes("lurkr")) return "lurkr";
  if (declared.includes("polaris")) return "polaris";
  if (declared.includes("arcane")) return "arcane-file";
  if (declared.includes("level")) return "level-up";
  if (declared.includes("xp")) return "xp-bot";
  return "generic-json";
}

function readId(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    if (isRecord(value) && typeof value.id === "string") return value.id.trim();
  }
  return undefined;
}

function readNumber(row: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function normalizeHeader(value: string): string {
  return value.trim().replaceAll(" ", "").toLowerCase();
}

/** RFC 4180-ish table parser: quoted cells, escaped quotes and CRLF. */
function parseTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((entry) => entry.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((entry) => entry.trim() !== "")) rows.push(row);
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
