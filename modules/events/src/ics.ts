import type { EventDefinition, EventRsvp } from "@keystone/kernel";

/**
 * RFC 5545 calendar text for the RSVP rows already in the export.
 *
 * This is a serializer, not a second read path: it takes the exact `EventExport`
 * payload `/event export` already builds, so the JSON and the `.ics` file can
 * never disagree about which events or answers exist.
 */
export interface CalendarSource {
  readonly events: readonly EventDefinition[];
  readonly rsvps: readonly EventRsvp[];
  readonly generatedAt: string;
}

const HOUR = 60 * 60_000;

/** `20261105T180000Z`; the only date-time form this file emits. */
function stamp(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Escape the four characters RFC 5545 reserves in a TEXT value. Backslash must
 * be replaced first, or the escapes added for semicolons would be doubled.
 */
function text(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold at 75 octets, not characters: a German or emoji description can exceed
 * the limit with far fewer visible glyphs. Continuation lines start with one
 * space, which counts toward the 75.
 */
function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const character of line) {
    const budget = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + character, "utf8") > budget) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

function attendee(rsvp: EventRsvp): string {
  const status = rsvp.state === "going" ? "ACCEPTED" : "DECLINED";
  // A Discord snowflake is not an email; a URN is a real CAL-ADDRESS and keeps
  // the member id intact without inventing an address the member never had.
  return `ATTENDEE;CN=${rsvp.userId};PARTSTAT=${status};ROLE=REQ-PARTICIPANT;RSVP=FALSE:urn:discord:user:${rsvp.userId}`;
}

/**
 * One VEVENT per event, with an ATTENDEE line for every RSVP row in the
 * payload. A missing end becomes one hour: calendars need a DTEND and guessing
 * a longer duration would invent a plan the operator did not make.
 */
export function buildEventCalendar(source: CalendarSource): string {
  const generatedAt = Date.parse(source.generatedAt);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Keystone//Guild events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of source.events) {
    const start = Date.parse(event.startsAt);
    const declaredEnd = event.endsAt ? Date.parse(event.endsAt) : start + HOUR;
    const end = Number.isFinite(declaredEnd) && declaredEnd > start ? declaredEnd : start + HOUR;
    const rows = source.rsvps.filter((rsvp) => rsvp.eventId === event.id);
    const going = rows.filter((rsvp) => rsvp.state === "going").length;
    const notGoing = rows.length - going;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@keystone`,
      `DTSTAMP:${stamp(Number.isFinite(generatedAt) ? generatedAt : Date.now())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${text(event.name)}`,
      `DESCRIPTION:${text(event.description)}`,
      `LOCATION:${text(event.location)}`,
      "STATUS:CONFIRMED",
      `X-KEYSTONE-EVENT-KEY:${text(event.key)}`,
      `X-KEYSTONE-EVENT-STATE:${event.state}`,
      `X-KEYSTONE-GOING:${going}`,
      `X-KEYSTONE-NOT-GOING:${notGoing}`,
      ...rows.map(attendee),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
