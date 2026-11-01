import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "@keystone/kernel";
import type { GuildAccessService } from "./access";
import type { AuthService } from "./auth";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  parseCookies,
  serializeCookie,
} from "./cookies";
import { HttpError } from "./http-error";
import type { DashboardService, DashboardView } from "./overview";
import type { DiscordGuild } from "./oauth";

export interface WebServerDeps {
  auth: AuthService;
  access: GuildAccessService;
  dashboard: DashboardService;
  logger: Logger;
  secureCookies: boolean;
  databaseMode: "memory" | "postgres";
}

const STATE_MAX_AGE_MS = 10 * 60_000;
const MAX_BODY_BYTES = 2_048;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function securityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  headers: Record<string, string | string[]> = {},
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown, cookies: string[] = []): void {
  const headers: Record<string, string | string[]> = { "Cache-Control": "no-store" };
  if (cookies.length > 0) headers["Set-Cookie"] = cookies;
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8", headers);
}

function redirect(res: ServerResponse, location: string, cookies: string[] = []): void {
  const headers: Record<string, string | string[]> = { Location: location, "Cache-Control": "no-store" };
  if (cookies.length > 0) headers["Set-Cookie"] = cookies;
  send(res, 302, "", "text/plain; charset=utf-8", headers);
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "The form body is too large.", "body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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
pre{white-space:pre-wrap;word-break:break-word;background:#0b0f14;border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;font-size:13px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
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

function percent(value: string): string {
  return encodeURIComponent(value);
}

function renderLanding(username?: string, csrfToken?: string): string {
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

function renderGuildList(username: string, guilds: DiscordGuild[], csrfToken: string): string {
  const rows = guilds
    .map(
      (guild) =>
        `<tr><td><a href="/dashboard/guilds/${percent(guild.id)}">${escapeHtml(guild.name)}</a></td><td class="muted">${escapeHtml(guild.id)}</td></tr>`,
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

function renderOverview(username: string, view: DashboardView, csrfToken: string): string {
  const stats = [
    ["Cases", view.counts.cases],
    ["Open tickets", view.counts.openTickets],
    ["Level rows", view.counts.levels],
    ["Imports", view.counts.imports],
    ["Backups", view.counts.backups],
  ]
    .map(([label, value]) => `<div class="stat"><b>${value}</b><span>${escapeHtml(String(label))}</span></div>`)
    .join("");
  const modules = view.modules
    .map(
      (module) =>
        `<div class="panel"><h3>${escapeHtml(module.name)} <span class="muted">· ${escapeHtml(module.version)} · ${module.enabled ? "enabled" : "disabled"}</span></h3>
         <p class="muted">${escapeHtml(module.description)}</p>
         <pre>${escapeHtml(JSON.stringify(module.settings, null, 2))}</pre></div>`,
    )
    .join("");
  const latest = view.latestImport
    ? `<p class="muted">Latest import: ${escapeHtml(view.latestImport.source)} · ${escapeHtml(view.latestImport.state)} · ${escapeHtml(view.latestImport.createdAt)}</p>`
    : `<p class="muted">No import receipts yet.</p>`;
  return layout(
    view.guild.name,
    `<p><a href="/dashboard">← All servers</a></p>
     <h1>${escapeHtml(view.guild.name)}</h1>
     <p class="muted">Guild ${escapeHtml(view.guild.id)} · read-only P6 foundation</p>
     <div class="grid">${stats}</div>
     <div class="panel"><h2>Portability</h2>${latest}</div>
     ${modules}
     <p class="muted">Settings writes, templates and fleet controls are not part of this foundation pass.</p>
     ${logoutForm(csrfToken)}`,
    username,
  );
}

function renderError(title: string, message: string): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to Keystone</a></p>`);
}

export function createWebHandler(deps: WebServerDeps): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    securityHeaders(res);
    void handle(req, res, deps).catch((error: unknown) => {
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError(500, "Something went wrong. The error has been logged.", "internal_error");
      if (!(error instanceof HttpError)) {
        // A callback URL contains the one-use OAuth code; never log the query.
        const requestPath = (req.url ?? "/").split("?")[0] || "/";
        deps.logger.error("web request failed", {
          path: requestPath,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        });
      }
      const isApi = (req.url ?? "").startsWith("/api/");
      if (isApi) {
        sendJson(res, httpError.status, { error: { code: httpError.code, message: httpError.message } });
      } else {
        send(res, httpError.status, renderError("Request failed", httpError.message), "text/html; charset=utf-8", {
          "Cache-Control": "no-store",
        });
      }
    });
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: WebServerDeps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.get(SESSION_COOKIE);
  const session = await deps.auth.session(sessionToken);

  const requireSession = () => {
    if (!session) throw new HttpError(401, "Sign in with Discord first.", "unauthenticated");
    return session;
  };
  const csrfToken = cookies.get(CSRF_COOKIE) ?? "";

  if (path === "/healthz" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      database: deps.databaseMode,
      oauth: deps.auth.oauthConfigured,
    });
    return;
  }

  if (path === "/login" && method === "GET") {
    if (session) {
      redirect(res, "/dashboard");
      return;
    }
    const begin = deps.auth.begin();
    redirect(res, begin.authorizationUrl, [
      serializeCookie(STATE_COOKIE, begin.stateCookie, {
        maxAgeMs: STATE_MAX_AGE_MS,
        httpOnly: true,
        secure: deps.secureCookies,
        sameSite: "Lax",
      }),
    ]);
    return;
  }

  if (path === "/auth/callback" && method === "GET") {
    const result = await deps.auth.complete({
      code: url.searchParams.get("code") ?? "",
      state: url.searchParams.get("state") ?? "",
      iss: url.searchParams.get("iss") ?? "",
      stateCookie: cookies.get(STATE_COOKIE),
    });
    redirect(res, "/dashboard", [
      serializeCookie(SESSION_COOKIE, result.sessionToken, {
        maxAgeMs: deps.auth.ttlMs,
        httpOnly: true,
        secure: deps.secureCookies,
        sameSite: "Lax",
      }),
      serializeCookie(CSRF_COOKIE, result.csrfToken, {
        maxAgeMs: deps.auth.ttlMs,
        httpOnly: true,
        secure: deps.secureCookies,
        sameSite: "Lax",
      }),
      clearCookie(STATE_COOKIE, deps.secureCookies),
    ]);
    return;
  }

  if (path === "/logout" && method === "POST") {
    const active = requireSession();
    const body = await parseBody(req);
    const headerToken = req.headers["x-keystone-csrf"];
    const submitted =
      (typeof headerToken === "string" ? headerToken : undefined) ??
      new URLSearchParams(body).get("csrf") ??
      undefined;
    if (!deps.auth.csrfValid(active, submitted)) {
      throw new HttpError(403, "The CSRF token is missing or invalid.", "csrf_invalid");
    }
    await deps.auth.logout(active);
    redirect(res, "/", [
      clearCookie(SESSION_COOKIE, deps.secureCookies),
      clearCookie(CSRF_COOKIE, deps.secureCookies),
    ]);
    return;
  }

  if (path === "/" && method === "GET") {
    send(res, 200, renderLanding(session?.username, session ? csrfToken : undefined), "text/html; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }

  if (path === "/dashboard" && method === "GET") {
    const active = requireSession();
    const guilds = await deps.access.manageableGuilds(deps.auth.accessToken(active));
    send(res, 200, renderGuildList(active.username, guilds, csrfToken), "text/html; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }

  const dashboardGuild = /^\/dashboard\/guilds\/(\d{15,20})$/.exec(path);
  if (dashboardGuild && method === "GET") {
    const active = requireSession();
    const guildId = dashboardGuild[1] as string;
    const guild = await deps.access.authorize(deps.auth.accessToken(active), guildId);
    const view = await deps.dashboard.view(guild);
    send(res, 200, renderOverview(active.username, view, csrfToken), "text/html; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }

  if (path === "/api/v1/me" && method === "GET") {
    const active = requireSession();
    sendJson(res, 200, { user: { id: active.userId, username: active.username } });
    return;
  }

  if (path === "/api/v1/guilds" && method === "GET") {
    const active = requireSession();
    const guilds = await deps.access.manageableGuilds(deps.auth.accessToken(active));
    sendJson(res, 200, {
      guilds: guilds.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner,
      })),
    });
    return;
  }

  const apiGuild = /^\/api\/v1\/guilds\/(\d{15,20})\/overview$/.exec(path);
  if (apiGuild && method === "GET") {
    const active = requireSession();
    const guildId = apiGuild[1] as string;
    const guild = await deps.access.authorize(deps.auth.accessToken(active), guildId);
    const view = await deps.dashboard.view(guild);
    sendJson(res, 200, view);
    return;
  }

  if (path.startsWith("/api/")) {
    sendJson(res, 404, { error: { code: "not_found", message: "No such API route." } });
    return;
  }

  if (method !== "GET" && method !== "POST") {
    send(res, 405, renderError("Method not allowed", "That method is not supported here."), "text/html; charset=utf-8");
    return;
  }

  send(res, 404, renderError("Not found", "That page does not exist."), "text/html; charset=utf-8");
}
