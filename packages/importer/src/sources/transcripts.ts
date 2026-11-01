export interface ImportedTranscript {
  readonly source: "probot" | "ticket-tool" | "generic-json" | "generic-html";
  readonly title: string;
  readonly text: string;
  readonly messageCount: number;
  readonly warnings: readonly string[];
}

export interface TranscriptInput {
  readonly filename: string;
  readonly content: string;
}

const MAX_TRANSCRIPT_CHARS = 2_000_000;

/**
 * Transcripts are archives, not message rows. Keystone stores a normalized text
 * copy as a community record and never claims to rebuild the original Discord
 * messages from it.
 */
export function parseTranscriptFile(input: TranscriptInput): ImportedTranscript {
  if (input.content.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`Transcript is larger than ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters.`);
  }
  const lower = input.filename.toLowerCase();
  if (lower.endsWith(".json") || input.content.trimStart().startsWith("{")) {
    return parseJsonTranscript(input.content);
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm") || input.content.includes("<html")) {
    return parseHtmlTranscript(input.content);
  }
  return {
    source: "generic-json",
    title: input.filename,
    text: input.content,
    messageCount: 0,
    warnings: ["Plain-text transcript: stored verbatim, no message count was inferred."],
  };
}

export function parseJsonTranscript(content: string): ImportedTranscript {
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch (error) {
    throw new Error(`Transcript is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const record = isRecord(payload) ? payload : {};
  const ticket = isRecord(record.ticket) ? record.ticket : undefined;
  const messages = findMessages(payload);
  const source = detectedSource(record) ?? (ticket ? "probot" : "generic-json");
  const title = String(
    ticket?.subject ??
      ticket?.name ??
      record.subject ??
      record.title ??
      (isRecord(record.channel) ? record.channel.name : undefined) ??
      "Imported ticket transcript",
  );

  const warnings: string[] = [];
  const lines: string[] = [];
  for (const [index, message] of messages.entries()) {
    const author = readAuthor(message);
    const text = readContent(message);
    const timestamp = readTimestamp(message);
    if (!text) {
      warnings.push(`Message ${index + 1} has no text content and was omitted.`);
      continue;
    }
    lines.push(`${timestamp ? `[${timestamp}] ` : ""}${author ?? "unknown"}: ${text}`);
  }
  if (messages.length === 0) warnings.push("No messages array found; the JSON was stored as a title only.");

  return {
    source,
    title,
    text: lines.join("\n"),
    messageCount: lines.length,
    warnings,
  };
}

export function parseHtmlTranscript(content: string): ImportedTranscript {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content);
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, " ").trim() || "Imported ticket transcript";
  const messageCount = (content.match(/class=["'][^"']*\bmessage\b/gi) ?? []).length;
  const cleaned = content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    source: "ticket-tool",
    title,
    text: cleaned,
    messageCount,
    warnings: [
      "HTML transcripts are a best-effort archive. Recreate the ticket in Keystone if you need live actions.",
    ],
  };
}

function findMessages(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["messages", "transcript", "entries"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.messages)) {
      return value.messages.filter(isRecord);
    }
  }
  return [];
}

function readAuthor(message: Record<string, unknown>): string | undefined {
  for (const key of ["author", "user", "sender"]) {
    const value = message[key];
    if (typeof value === "string") return value;
    if (isRecord(value)) {
      const name = value.username ?? value.name ?? value.tag ?? value.id;
      if (typeof name === "string") return name;
    }
  }
  return undefined;
}

function readContent(message: Record<string, unknown>): string | undefined {
  for (const key of ["content", "text", "message", "body"]) {
    const value = message[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readTimestamp(message: Record<string, unknown>): string | undefined {
  for (const key of ["timestamp", "createdAt", "created_at", "date"]) {
    const value = message[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function detectedSource(record: Record<string, unknown>): ImportedTranscript["source"] | undefined {
  const raw = String(record.source ?? record.bot ?? record.exporter ?? "").toLowerCase();
  if (raw.includes("probot")) return "probot";
  if (raw.includes("ticket")) return "ticket-tool";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
