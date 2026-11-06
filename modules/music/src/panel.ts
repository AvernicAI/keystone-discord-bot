import type {
  MusicPlayerSnapshot,
  MusicQueue,
  MusicTrack,
  PanelSigner,
  V2Component,
} from "@keystone/kernel";
import {
  ACCENTS,
  GLYPHS,
  emptyState,
  facts,
  footer,
  heading,
  layout,
  readStamp,
  row,
  rows,
} from "@keystone/ui";

/**
 * A music card outlives a single song, but not a listening session. Twelve
 * hours is long enough for an evening; short enough that a screenshot's
 * buttons are dead by the next day.
 */
export const MUSIC_PANEL_TTL_MS = 12 * 60 * 60_000;

export type MusicPanelAction =
  | "toggle"
  | "skip"
  | "stop"
  | "loop"
  | "shuffle"
  | "voldown"
  | "volup"
  | "jump";

/**
 * The payload is empty: the interaction already carries the guild, and the
 * router refuses a click from another server before the handler runs. That
 * keeps every id short and means a card cannot be replayed against a guild it
 * was not posted in.
 */
export function musicCustomId(
  action: MusicPanelAction,
  signer: PanelSigner,
  now = Date.now(),
): string {
  return signer.sign(
    { namespace: "music", action, payload: "", ttlMs: MUSIC_PANEL_TTL_MS },
    now,
  );
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const total = Math.floor(ms / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const STATE_LABEL: Record<MusicPlayerSnapshot["state"], string> = {
  playing: "Playing",
  paused: "Paused",
  idle: "Idle",
  reconnecting: "Reconnecting",
};

const STATE_ACCENT: Record<MusicPlayerSnapshot["state"], number> = {
  playing: ACCENTS.ok,
  paused: ACCENTS.attention,
  idle: ACCENTS.muted,
  reconnecting: ACCENTS.attention,
};

function trackLine(track: MusicTrack): string {
  const title = track.title.replace(/[[\]]/g, "");
  return /^https?:\/\//.test(track.uri)
    ? `**[${title}](${track.uri})**`
    : `**${title}**`;
}

function queueRow(track: MusicTrack, position: number): string {
  return row({
    text: `${position}. ${track.title}${track.artist ? ` — ${track.artist}` : ""}`,
    source: track.requestedBy ? `<@${track.requestedBy}>` : undefined,
  });
}

export interface MusicPanelOptions {
  /** Signed ids; without a signer the card is a read-only snapshot. */
  readonly signer?: PanelSigner;
  readonly readAt?: number;
}

/**
 * One card for the whole player. It is built from the shared grammar so it has
 * the same heading, facts, rows, footer and action rhythm as every other
 * Keystone surface, and it never invents progress: the elapsed time is the
 * node's last reported position, and the read stamp says when it was read.
 */
export function musicPanel(
  snapshot: MusicPlayerSnapshot,
  queue: MusicQueue,
  options: MusicPanelOptions = {},
): V2Component[] {
  const readAt = options.readAt ?? Date.now();
  const track = snapshot.track;
  // With no current track the durable head is the next thing to resume, so it
  // belongs in the queue preview too. It is not "upcoming" while it plays.
  const upcoming = track ? queue.tracks.slice(1) : queue.tracks;
  const firstPosition = track ? 2 : 1;
  const position = formatDuration(snapshot.positionMs);
  const duration = track?.isStream ? "LIVE" : formatDuration(track?.durationMs);
  const progress =
    track && position && duration
      ? `${position} / ${duration}`
      : track && position
        ? `${position} elapsed`
        : undefined;

  const summary = facts([
    STATE_LABEL[snapshot.state],
    progress,
    `${snapshot.volume}% volume`,
    `loop ${snapshot.loop}`,
    `${queue.tracks.length} in queue`,
  ]);

  const visible = rows(upcoming.map((entry, index) => queueRow(entry, firstPosition + index)), 5);
  const hidden = visible.hidden;
  const queueText =
    upcoming.length === 0
      ? emptyState({
          fact: "Nothing is queued after this track.",
          next: "Add one with `/music play query:<url>` or `/music add`.",
        })
      : `${visible.block}${hidden > 0 ? `\n-# +${hidden} more queued.` : ""}`;

  const sign = (action: MusicPanelAction): string | undefined =>
    options.signer ? musicCustomId(action, options.signer, readAt) : undefined;
  const idle = snapshot.state === "idle" || !track;
  const toggle = sign("toggle");
  const skip = sign("skip");
  const stop = sign("stop");
  const loop = sign("loop");
  const shuffle = sign("shuffle");
  const voldown = sign("voldown");
  const volup = sign("volup");
  const jump = sign("jump");

  return layout((ui) => {
    ui.container({ accentColor: STATE_ACCENT[snapshot.state] }, (box) => {
      box.text(
        heading({
          glyph: GLYPHS.music,
          title: track ? track.title : "Nothing playing",
          context: `${STATE_LABEL[snapshot.state]} · <#${snapshot.voiceChannelId}> · this server`,
        }),
      );

      if (track) {
        const detail = [
          trackLine(track),
          track.artist ? `-# ${track.artist}` : undefined,
        ].filter((part): part is string => Boolean(part));
        if (track.artworkUrl) {
          box.section(detail, ui.thumbnail({ url: track.artworkUrl, description: track.title }));
        } else {
          box.text(detail.join("\n"));
        }
      } else {
        box.text(
          emptyState(
            queue.tracks.length > 0
              ? {
                  fact: `The player is idle; ${queue.tracks.length} saved track${queue.tracks.length === 1 ? "" : "s"} wait in the queue.`,
                  next: "Run `/music play` with no URL, or use Resume on the dashboard, to start the head.",
                }
              : {
                  fact: "The player is idle and the queue is empty.",
                  next: "Join a voice channel and run `/music play query:<http(s) audio url>`.",
                },
          ),
        );
      }

      if (summary) box.text(summary);
      box.separator({ spacing: "small" });
      box.text(`**Up next**\n${queueText}`);
      box.text(
        footer([
          readStamp(readAt, "one durable queue · the head is the current track"),
          track?.requestedBy ? `Requested by <@${track.requestedBy}>` : undefined,
          "Progress is the node's last report, not a timer.",
        ]),
      );

      if (toggle && skip && stop && loop && shuffle) {
        box.actions([
          ui.button({
            style: "primary",
            label: snapshot.state === "paused" ? "▶ Resume" : "⏸ Pause",
            customId: toggle,
            disabled: idle,
          }),
          ui.button({ style: "secondary", label: "⏭ Skip", customId: skip, disabled: idle }),
          ui.button({ style: "secondary", label: "🔀 Shuffle", customId: shuffle, disabled: idle }),
          ui.button({
            style: "secondary",
            label: `🔁 Loop: ${snapshot.loop}`,
            customId: loop,
            disabled: idle,
          }),
          ui.button({ style: "secondary", label: "⏹ Stop", customId: stop, disabled: idle }),
        ]);
      }

      if (voldown && volup) {
        box.actions([
          ui.button({ style: "secondary", label: "🔉 −10%", customId: voldown, disabled: idle }),
          ui.button({ style: "secondary", label: "🔊 +10%", customId: volup, disabled: idle }),
        ]);
      }

      if (jump && upcoming.length > 0) {
        box.actions([
          ui.select({
            customId: jump,
            placeholder: "Jump to a queued track",
            options: upcoming.slice(0, 25).map((entry, index) => ({
              label: `${firstPosition + index}. ${entry.title}`.slice(0, 100),
              value: String(firstPosition + index),
              ...(entry.artist ? { description: entry.artist.slice(0, 100) } : {}),
            })),
          }),
        ]);
      }
    });
  });
}
