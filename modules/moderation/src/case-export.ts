import { createHash } from "node:crypto";
import type { CaseEvent, CaseStore, ModerationCase } from "@keystone/kernel";

export type CaseExportFormat = "json" | "csv";

/** What the command attaches; `checksum` covers the case and event content. */
export interface CaseExportResult {
  readonly fileName: string;
  readonly content: string;
  readonly checksum: string;
  readonly cases: number;
  readonly events: number;
}

interface ExportedCase {
  readonly record: ModerationCase;
  readonly events: readonly CaseEvent[];
}

const HEADER = [
  "case",
  "action",
  "state",
  "target",
  "actor",
  "rule",
  "created",
  "updated",
  "expires",
  "reason",
  "evidence",
  "event_count",
  "history",
  "checksum",
] as const;

/**
 * Canonical JSON is the checksum's contract, copied from the importer for the
 * same reason: key order must not change the hash. This module deliberately
 * depends on the kernel only, so it cannot import that helper.
 */
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot hash a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return "null";
}

/** JSON round-tripping first drops undefined fields, so the hash matches a file. */
function contentDigest(payload: unknown): string {
  const normalized: unknown = JSON.parse(JSON.stringify(payload));
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function eventSummary(event: CaseEvent): string {
  const actor = event.actorId ? ` by ${event.actorId}` : "";
  return `${event.createdAt} ${event.type}${actor}`;
}

function toCsv(entries: readonly ExportedCase[], checksum: string): string {
  const rows = entries.map(({ record, events }) => [
    record.caseNumber,
    record.action,
    record.state,
    record.targetId,
    record.actorId,
    record.rule,
    record.createdAt,
    record.updatedAt,
    record.expiresAt,
    record.reason,
    record.evidence,
    events.length,
    events.map(eventSummary).join(" | "),
    checksum,
  ]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * One readable export for the moderation record.
 *
 * JSON carries every case and its append-only events, so it is the format to
 * hand to a reviewer. CSV is one row per case with the event count and a
 * compact event history, which is what a spreadsheet can actually open. Both
 * formats hash the same normalized case/event payload, so the checksums agree
 * for the same data and moment; the checksum is also written into the file.
 *
 * There is no new table and no stored export: the rows already in `CaseStore`
 * are the source, and a missing case is an empty result rather than an error.
 */
export type CaseReader = Pick<CaseStore, "get" | "list" | "listEvents">;

export class CaseExportService {
  constructor(
    private readonly cases: CaseReader,
    private readonly now: () => number = Date.now,
  ) {}

  async one(
    guildId: string,
    caseNumber: number,
    format: CaseExportFormat,
  ): Promise<CaseExportResult | undefined> {
    const record = await this.cases.get(guildId, caseNumber);
    if (!record) return undefined;
    const events = await this.cases.listEvents(record.id);
    return this.build([{ record, events }], format, `keystone-case-${caseNumber}`);
  }

  async recent(
    guildId: string,
    filter: { targetId?: string; limit?: number },
    format: CaseExportFormat,
  ): Promise<CaseExportResult> {
    const limit = Math.min(Math.max(filter.limit ?? 10, 1), 50);
    const records = await this.cases.list(guildId, { targetId: filter.targetId, limit });
    const entries = await Promise.all(
      records.map(async (record) => ({
        record,
        events: await this.cases.listEvents(record.id),
      })),
    );
    const day = new Date(this.now()).toISOString().slice(0, 10);
    return this.build(entries, format, `keystone-cases-${day}`);
  }

  private build(
    entries: readonly ExportedCase[],
    format: CaseExportFormat,
    stem: string,
  ): CaseExportResult {
    const exportedAt = new Date(this.now()).toISOString();
    const cases = entries.map(({ record, events }) => ({ ...record, events }));
    // The hash covers the content, not the export moment, so the same case
    // exported twice keeps the same checksum.
    const checksum = contentDigest({ guildId: entries[0]?.record.guildId, cases });
    const eventCount = entries.reduce((total, entry) => total + entry.events.length, 0);

    if (format === "csv") {
      return {
        fileName: `${stem}.csv`,
        content: toCsv(entries, checksum),
        checksum,
        cases: entries.length,
        events: eventCount,
      };
    }

    const payload = {
      format: "keystone.case-export.v1",
      exportedAt,
      guildId: entries[0]?.record.guildId ?? null,
      caseCount: entries.length,
      eventCount,
      cases,
      checksum,
    };
    return {
      fileName: `${stem}.json`,
      content: `${JSON.stringify(payload, null, 2)}\n`,
      checksum,
      cases: entries.length,
      events: eventCount,
    };
  }
}
