export const SESSION_COOKIE = "keystone_session";
export const CSRF_COOKIE = "keystone_csrf";
export const STATE_COOKIE = "keystone_oauth";

export interface CookieOptions {
  maxAgeMs?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict";
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    // A malformed cookie must be ignored, not turn into an unhandled 500.
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
  if (options.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeMs / 1_000))}`);
  }
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", { maxAgeMs: 0, httpOnly: true, secure, sameSite: "Lax" });
}
