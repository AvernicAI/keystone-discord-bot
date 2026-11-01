import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger, WebSession } from "@keystone/kernel";
import type { GuildAccessService } from "./access";
import type { AuthService } from "./auth";
import { CSRF_COOKIE, SESSION_COOKIE, parseCookies } from "./cookies";
import type { DashboardService } from "./overview";

export interface WebServerDeps {
  auth: AuthService;
  access: GuildAccessService;
  dashboard: DashboardService;
  logger: Logger;
  secureCookies: boolean;
  databaseMode: "memory" | "postgres";
}

export interface RouteContext {
  readonly deps: WebServerDeps;
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly path: string;
  readonly method: string;
  readonly cookies: Map<string, string>;
  readonly session: WebSession | undefined;
  readonly csrfToken: string;
}

/**
 * Every route receives the same request facts. In particular, the session is
 * resolved once here, before any route runs; handlers must not re-read cookies
 * or re-hash the session id.
 */
export async function createRouteContext(
  req: IncomingMessage,
  res: ServerResponse,
  deps: WebServerDeps,
): Promise<RouteContext> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const cookies = parseCookies(req.headers.cookie);
  const session = await deps.auth.session(cookies.get(SESSION_COOKIE));

  return {
    deps,
    req,
    res,
    url,
    path: url.pathname,
    method: req.method ?? "GET",
    cookies,
    session,
    csrfToken: cookies.get(CSRF_COOKIE) ?? "",
  };
}
