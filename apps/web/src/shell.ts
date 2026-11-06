import { encodePathSegment } from "./http";
import { escapeHtml, initials, timestamp } from "./html";
import { WEB_ACCENTS, WEB_STYLES } from "./theme";

export interface ShellGuild {
  readonly id: string;
  readonly name: string;
  readonly icon?: string | null;
}

export type GuildSection =
  | "overview"
  | "analytics"
  | "activity"
  | "directory"
  | "settings"
  | "config"
  | "templates"
  | "tokens"
  | "webhooks";

export interface Breadcrumb {
  readonly label: string;
  readonly href?: string;
}

export interface PageChrome {
  /** Document title and visible page heading. */
  readonly title: string;
  /** Small label above the heading; defaults to the guild name on guild pages. */
  readonly eyebrow?: string;
  readonly lede?: string;
  readonly username?: string;
  readonly csrfToken?: string;
  readonly owner?: boolean;
  readonly guild?: ShellGuild;
  readonly section?: GuildSection;
  readonly breadcrumb?: readonly Breadcrumb[];
  /** Trusted HTML built by the page renderer. */
  readonly actions?: string;
  /** Render the heading block. Off for pages that keep their own h1. */
  readonly head?: boolean;
  readonly storage?: "postgres" | "memory";
}

export type LayoutOptions = Omit<PageChrome, "title" | "username" | "head">;

export type IconName =
  | "home"
  | "chart"
  | "activity"
  | "hash"
  | "sliders"
  | "database"
  | "layers"
  | "key"
  | "webhook"
  | "server"
  | "shield"
  | "spark"
  | "check"
  | "arrow"
  | "external";

const ICON_PATHS: Record<IconName, string> = {
  home: '<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l3.5-4.5 3 2.5L20 6"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14 2.5-7H21"/>',
  hash: '<path d="M9 3 7.5 21M16.5 3 15 21M4 8.5h17M3 15.5h17"/>',
  sliders: '<path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M17 6l2 2M14 9l2 2"/>',
  webhook: '<path d="M9 9a4 4 0 1 1 6 3.4"/><path d="M15 15a4 4 0 1 1-6-3.4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  shield: '<path d="M12 3 20 6v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

export function icon(name: IconName, className = "icon"): string {
  return `<svg class="${escapeHtml(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

export function guildAvatar(guild: ShellGuild): string {
  const hash = guild.icon ?? "";
  if (/^[A-Za-z0-9_]+$/.test(hash)) {
    return `<img class="avatar lg" src="https://cdn.discordapp.com/icons/${encodePathSegment(guild.id)}/${hash}.png?size=64" alt="" width="38" height="38" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return `<span class="avatar lg" aria-hidden="true">${escapeHtml(initials(guild.name))}</span>`;
}

function guildBase(guild: ShellGuild): string {
  return `/dashboard/guilds/${encodePathSegment(guild.id)}`;
}

const NAV_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly links: ReadonlyArray<{
    readonly section: GuildSection;
    readonly label: string;
    readonly icon: IconName;
    readonly path: string;
  }>;
}> = [
  {
    label: "Observe",
    links: [
      { section: "overview", label: "Overview", icon: "home", path: "" },
      { section: "analytics", label: "Analytics", icon: "chart", path: "/analytics" },
      { section: "activity", label: "Activity", icon: "activity", path: "/activity" },
      { section: "directory", label: "Channels & roles", icon: "hash", path: "/directory" },
    ],
  },
  {
    label: "Configure",
    links: [
      { section: "settings", label: "Module settings", icon: "sliders", path: "#modules" },
      { section: "config", label: "Config & drift", icon: "database", path: "/config/drift" },
      { section: "templates", label: "Templates", icon: "layers", path: "/templates" },
    ],
  },
  {
    label: "Integrate",
    links: [
      { section: "tokens", label: "API tokens", icon: "key", path: "/tokens" },
      { section: "webhooks", label: "Webhooks", icon: "webhook", path: "/webhooks" },
    ],
  },
];

function sidebar(guild: ShellGuild, section: GuildSection | undefined): string {
  const base = guildBase(guild);
  const groups = NAV_GROUPS.map((group) => {
    const links = group.links
      .map((link) => {
        const current = link.section === section ? ' aria-current="page"' : "";
        return `<a class="nav-link" href="${base}${link.path}"${current}>${icon(link.icon)}<span>${escapeHtml(link.label)}</span></a>`;
      })
      .join("");
    return `<div class="nav-group">${escapeHtml(group.label)}</div>${links}`;
  }).join("");

  return `<aside class="sidebar" aria-label="Server">
    <a class="guild-chip" href="${base}">
      ${guildAvatar(guild)}
      <span style="min-width:0">
        <span class="name">${escapeHtml(guild.name)}</span>
        <span class="scope">Manage Server access</span>
      </span>
    </a>
    <nav class="nav" aria-label="Server sections">${groups}</nav>
    <div class="sidebar-foot">
      <a class="nav-link" href="/dashboard/fleet">${icon("server")}<span>Fleet</span></a>
      <a class="nav-link" href="/dashboard">${icon("layers")}<span>All servers</span></a>
    </div>
  </aside>`;
}

function account(username: string | undefined, csrfToken: string | undefined, owner: boolean): string {
  if (!username) {
    return `<a class="btn primary small" href="/login">Sign in with Discord</a>`;
  }
  const signOut =
    csrfToken && csrfToken.length > 0
      ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit" class="danger">Sign out</button></form>`
      : "";
  return `<details class="account">
    <summary>
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(username))}</span>
      <span class="who">${escapeHtml(username)}</span>
      <span class="faint" aria-hidden="true">▾</span>
    </summary>
    <div class="menu">
      <a href="/dashboard">All servers</a>
      ${owner ? `<a href="/dashboard/instance">Instance console</a>` : ""}
      <hr class="sep">
      ${signOut}
    </div>
  </details>`;
}

function breadcrumbHtml(chrome: PageChrome): string {
  const trail: readonly Breadcrumb[] =
    chrome.breadcrumb ??
    (chrome.guild
      ? [
          { label: "All servers", href: "/dashboard" },
          { label: chrome.guild.name },
        ]
      : []);
  if (trail.length === 0) return "";
  const items = trail
    .map((item) =>
      item.href
        ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
        : `<span aria-current="page">${escapeHtml(item.label)}</span>`,
    )
    .join('<span aria-hidden="true">/</span>');
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${items}</nav>`;
}

export function pageHead(chrome: PageChrome): string {
  if (chrome.head === false) return "";
  const eyebrow = chrome.eyebrow ?? chrome.guild?.name ?? "Keystone";
  return `<header class="page-head">
    <div>
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(chrome.title)}</h1>
      ${chrome.lede ? `<p class="lede">${escapeHtml(chrome.lede)}</p>` : ""}
    </div>
    ${chrome.actions ? `<div class="page-actions">${chrome.actions}</div>` : ""}
  </header>`;
}

/**
 * The one document shell. Every page gets the same top bar, skip link, optional
 * guild sidebar, heading rules and honest footer; pages only supply a body.
 *
 * `actions` is trusted HTML because the page builders compose buttons and
 * links; every value interpolated inside those builders is escaped.
 */
export function renderShell(chrome: PageChrome, body: string): string {
  const storage = chrome.storage ?? (process.env.DATABASE_URL ? "postgres" : "memory");
  const nav = chrome.guild ? sidebar(chrome.guild, chrome.section) : "";
  const layoutClass = chrome.guild ? "layout" : "layout solo";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="Keystone: one audited Discord bot for moderation, community, support and operations.">
<title>${escapeHtml(chrome.title)} · Keystone</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${WEB_ACCENTS.brand}"/><path d="M10 8v16M22 8 12 16l10 8" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`)}">
<style>${WEB_STYLES}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">K</span><span>Keystone</span></a>
  <span class="brand-sub">Dashboard</span>
  <span class="topbar-spacer"></span>
  ${chrome.guild ? `<a class="topbar-link" href="/dashboard">Servers</a>` : ""}
  ${account(chrome.username, chrome.csrfToken, chrome.owner ?? false)}
</header>
<main id="main">
  <div class="${layoutClass}">
    ${nav}
    <div class="content">
      ${breadcrumbHtml(chrome)}
      ${pageHead(chrome)}
      ${body}
    </div>
  </div>
</main>
<footer class="footer">
  <span>Read ${escapeHtml(timestamp(new Date()))} · ${escapeHtml(storage)} · every accepted write is audited</span>
  <span>Keystone · self-hosted · no paid tier</span>
</footer>
</body>
</html>`;
}

/**
 * Compatibility wrapper for the pages that still own their `<h1>`.
 * New surfaces go through `renderShell` with `head: true`.
 */
export function renderLegacyLayout(
  title: string,
  body: string,
  username?: string,
  chrome: Omit<PageChrome, "title" | "username" | "head"> = {},
): string {
  return renderShell({ ...chrome, title, username, head: false }, body);
}
