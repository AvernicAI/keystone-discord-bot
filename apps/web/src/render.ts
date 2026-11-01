import type { DashboardModule, DashboardView } from "./overview";
import type { DiscordGuild } from "./oauth";
import { encodePathSegment } from "./http";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, body: string, username?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Keystone</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#5865f2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
header{border-bottom:1px solid var(--line);padding:16px 24px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
main{max-width:960px;margin:0 auto;padding:32px 24px 64px}a{color:#8ea1ff;text-decoration:none}a:hover{text-decoration:underline}
.brand{font-weight:700;letter-spacing:.02em;color:var(--text)}.muted{color:var(--muted)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.stat b{display:block;font-size:24px}.stat span{color:var(--muted);font-size:13px}
button{background:var(--accent);color:#fff;border:0;border-radius:7px;padding:8px 14px;font:inherit;cursor:pointer}
pre,textarea{white-space:pre-wrap;word-break:break-word;background:#0b0f14;border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;font-size:13px;color:var(--text);width:100%}
textarea{font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
p.error{color:#ffb4b4}
</style>
</head>
<body>
<header><a class="brand" href="/">Keystone</a><span class="muted">${username ? `signed in as ${escapeHtml(username)}` : "dashboard"}</span></header>
<main>${body}</main>
</body>
</html>`;
}

function logoutForm(csrfToken: string): string {
  return `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit">Sign out</button></form>`;
}

export function renderLanding(username?: string, csrfToken?: string): string {
  if (!username) {
    return layout(
      "Welcome",
      `<h1>Keystone dashboard</h1>
       <p class="muted">Sign in with Discord to manage a server. The dashboard only shows servers you can already manage, and every read re-checks your Discord permissions.</p>
       <p><a href="/login">Sign in with Discord</a></p>`,
    );
  }
  return layout(
    "Welcome",
    `<h1>Keystone dashboard</h1>
     <p>Signed in as <strong>${escapeHtml(username)}</strong>.</p>
     <p><a href="/dashboard">Open your servers</a></p>
     ${csrfToken ? logoutForm(csrfToken) : ""}`,
    username,
  );
}

export function renderGuildList(
  username: string,
  guilds: DiscordGuild[],
  csrfToken: string,
): string {
  const rows = guilds
    .map(
      (guild) =>
        `<tr><td><a href="/dashboard/guilds/${encodePathSegment(guild.id)}">${escapeHtml(guild.name)}</a></td><td class="muted">${escapeHtml(guild.id)}</td></tr>`,
    )
    .join("");
  return layout(
    "Your servers",
    `<h1>Your servers</h1>
     <p class="muted">Only servers where you are owner or hold Administrator / Manage Server are listed. Keystone must also be in the server for its detail page to load.</p>
     <div class="panel">
       ${guilds.length === 0 ? "<p>No manageable servers yet.</p>" : `<table><thead><tr><th>Server</th><th>ID</th></tr></thead><tbody>${rows}</tbody></table>`}
     </div>
     ${logoutForm(csrfToken)}`,
    username,
  );
}

export function renderOverview(
  username: string,
  view: DashboardView,
  csrfToken: string,
): string {
  const stats = [
    ["Cases", view.counts.cases],
    ["Open tickets", view.counts.openTickets],
    ["Level rows", view.counts.levels],
    ["Imports", view.counts.imports],
    ["Backups", view.counts.backups],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><b>${value}</b><span>${escapeHtml(String(label))}</span></div>`,
    )
    .join("");
  const modules = view.modules
    .map(
      (module) =>
        `<div class="panel"><h3>${escapeHtml(module.name)} <span class="muted">· ${escapeHtml(module.version)} · ${module.enabled ? "enabled" : "disabled"}</span></h3>
         <p class="muted">${escapeHtml(module.description)}</p>
         <pre>${escapeHtml(JSON.stringify(module.settings, null, 2))}</pre>
         <p><a href="/dashboard/guilds/${encodePathSegment(view.guild.id)}/settings/${encodePathSegment(module.id)}">Edit settings</a></p></div>`,
    )
    .join("");
  const latest = view.latestImport
    ? `<p class="muted">Latest import: ${escapeHtml(view.latestImport.source)} · ${escapeHtml(view.latestImport.state)} · ${escapeHtml(view.latestImport.createdAt)}</p>`
    : `<p class="muted">No import receipts yet.</p>`;
  return layout(
    view.guild.name,
    `<p><a href="/dashboard">← All servers</a></p>
     <h1>${escapeHtml(view.guild.name)}</h1>
     <p class="muted">Guild ${escapeHtml(view.guild.id)} · P6 foundation · settings writes enabled</p>
     <div class="grid">${stats}</div>
     <div class="panel"><h2>Portability</h2>${latest}</div>
     ${modules}
     <p class="muted">Settings are validated by each module's own schema. Templates and fleet controls remain open.</p>
     ${logoutForm(csrfToken)}`,
    username,
  );
}

export function renderSettingsEditor(
  username: string,
  guild: DiscordGuild,
  module: DashboardModule,
  csrfToken: string,
): string {
  const action = `/dashboard/guilds/${encodePathSegment(guild.id)}/settings/${encodePathSegment(module.id)}`;
  return layout(
    `${module.name} settings`,
    `<p><a href="/dashboard/guilds/${encodePathSegment(guild.id)}">← Back to ${escapeHtml(guild.name)}</a></p>
     <h1>${escapeHtml(module.name)} settings</h1>
     <p class="muted">${escapeHtml(module.description)} · version ${escapeHtml(module.version)}</p>
     <div class="panel">
       <p class="muted">The value is validated by this module's schema before it is stored. Send the complete settings object; unknown keys are ignored.</p>
       <form method="post" action="${action}">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <textarea name="settings" rows="22" spellcheck="false" aria-label="Settings JSON">${escapeHtml(JSON.stringify(module.settings, null, 2))}</textarea>
         <p><button type="submit">Save settings</button></p>
       </form>
     </div>
     ${logoutForm(csrfToken)}`,
    username,
  );
}

export function renderError(title: string, message: string): string {
  return layout(
    title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to Keystone</a></p>`,
  );
}
