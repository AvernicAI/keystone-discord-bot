/**
 * The one palette and the one glyph set.
 *
 * A moderator should recognise a state by its colour in every module: green is
 * healthy, amber wants attention, red is a refusal or a danger, indigo is
 * neutral information, slate is an empty surface. Modules must import these
 * tokens instead of writing `0x...`, because a per-author palette is exactly
 * how an all-in-one bot starts to look assembled from different products.
 *
 * Discord gives Components V2 a single accent colour per container, so this is
 * the whole colour budget — pick a state, not a shade.
 */
export const ACCENTS = {
  /** Neutral information: a hub, a timeline, a summary. */
  brand: 0x5865f2,
  /** Healthy: verified, released, inside limits, enabled. */
  ok: 0x57f287,
  /** Attention: dry-run, quarantined, near a limit, needs review. */
  attention: 0xfee75c,
  /** Danger: refused, blocked, failed, open enforcement. */
  danger: 0xed4245,
  /** Empty or inert: nothing recorded, nothing wired. */
  muted: 0x2b2d31,
} as const;

export type AccentName = keyof typeof ACCENTS;

/**
 * Glyphs carry the same meaning as the accents in places markdown has no
 * colour: a row, a fact line, a section title. They are chosen from Discord's
 * own emoji set so no custom upload or paid emoji is needed.
 */
export const GLYPHS = {
  timeline: "🧭",
  shield: "🛡️",
  ticket: "🎫",
  levels: "📈",
  economy: "🪙",
  invites: "🤝",
  forms: "📝",
  events: "📅",
  modmail: "✉️",
  member: "🪪",
  ok: "✅",
  warn: "⚠️",
  block: "⛔",
  info: "ℹ️",
} as const;

export type GlyphName = keyof typeof GLYPHS;
