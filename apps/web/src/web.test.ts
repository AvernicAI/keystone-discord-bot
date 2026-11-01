import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InMemoryDashboardStore,
  InMemorySessionStore,
  InMemorySettingsRepository,
  ModuleRegistry,
  SettingsService,
  createSilentLogger,
  emptyOverview,
  type SessionStore,
} from "@keystone/kernel";
import { modules } from "@keystone/module-catalog";
import { GuildAccessService, canManageGuild } from "./access";
import { AuthService } from "./auth";
import { SecretBox, sha256 } from "./crypto";
import { createWebHandler } from "./server";
import { DashboardService } from "./overview";
import type { DiscordGuild, DiscordOAuth } from "./oauth";

const GUILD_A = "111111111111111111";
const GUILD_B = "222222222222222222";
const GUILD_C = "333333333333333333";
const GUILD_Z = "999999999999999999";
const USER = "444444444444444444";
const ACCESS_TOKEN = "discord-access-token-should-never-reach-browser";
const REFRESH_TOKEN = "discord-refresh-token-should-never-reach-browser";

class FakeOAuth implements DiscordOAuth {
  exchanges = 0;
  readonly guilds: DiscordGuild[] = [
    { id: GUILD_A, name: "Alpha <script>alert(1)</script>", icon: null, owner: false, permissions: String(1n << 5n) },
    { id: GUILD_B, name: "Beta", icon: null, owner: false, permissions: "0" },
    { id: GUILD_C, name: "Gamma", icon: null, owner: true, permissions: "0" },
  ];
  readonly botGuilds = new Set([GUILD_A, GUILD_B]);

  authorizationUrl(input: { state: string }): string {
    return `https://discord.test/oauth?state=${encodeURIComponent(input.state)}`;
  }

  async exchangeCode(): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    this.exchanges += 1;
    return { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, expiresIn: 3600 };
  }

  async fetchUser(): Promise<{ id: string; username: string }> {
    return { id: USER, username: "Admin <script>alert(1)</script>" };
  }

  async fetchGuilds(): Promise<DiscordGuild[]> {
    return this.guilds;
  }

  async botInGuild(guildId: string): Promise<boolean> {
    return this.botGuilds.has(guildId);
  }
}

interface Harness {
  base: string;
  server: Server;
  oauth: FakeOAuth;
  sessions: SessionStore;
  settings: SettingsService;
  close(): Promise<void>;
}

async function harness(): Promise<Harness> {
  const oauth = new FakeOAuth();
  const sessions = new InMemorySessionStore();
  const dashboardStore = new InMemoryDashboardStore().seed({
    ...emptyOverview(GUILD_A),
    guildId: GUILD_A,
    name: "Alpha",
    joinedAt: "2026-01-01T00:00:00.000Z",
    counts: { cases: 3, openTickets: 2, levels: 10, imports: 1, backups: 1 },
    latestImport: { id: "import-1", source: "bundle", state: "applied", createdAt: "2026-01-02T00:00:00.000Z" },
  });
  const registry = new ModuleRegistry().registerAll(modules);
  const settings = new SettingsService(new InMemorySettingsRepository(), registry);
  await settings.update(GUILD_A, "ai", { enabled: true, chat: true });
  const auth = new AuthService({
    oauth,
    sessions,
    box: new SecretBox(randomBytes(32)),
    config: {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost/auth/callback",
      issuer: "https://discord.com",
      sessionTtlMs: 7 * 24 * 60 * 60_000,
    },
  });
  const handler = createWebHandler({
    auth,
    access: new GuildAccessService(oauth),
    dashboard: new DashboardService(registry, settings, dashboardStore),
    logger: createSilentLogger(),
    secureCookies: false,
    databaseMode: "memory",
  });
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return {
    base: `http://127.0.0.1:${address.port}`,
    server,
    oauth,
    sessions,
    settings,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function cookieValue(response: Response, name: string): string | undefined {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return header?.split(";")[0]?.split("=")[1];
}

function patchSettings(
  test: Harness,
  cookie: string,
  csrf: string,
  guildId: string,
  moduleId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${test.base}/api/v1/guilds/${guildId}/settings/${moduleId}`, {
    method: "PATCH",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-keystone-csrf": csrf,
    },
    body: JSON.stringify(body),
  });
}

async function login(test: Harness): Promise<{ cookie: string; csrf: string }> {
  const begin = await fetch(`${test.base}/login`, { redirect: "manual" });
  expect(begin.status).toBe(302);
  const stateCookie = cookieValue(begin, "keystone_oauth");
  expect(stateCookie).toBeTruthy();
  const location = new URL(begin.headers.get("location") as string);
  const state = location.searchParams.get("state");
  expect(state).toBeTruthy();

  const callback = await fetch(
    `${test.base}/auth/callback?code=good&state=${encodeURIComponent(state as string)}&iss=${encodeURIComponent("https://discord.com")}`,
    { redirect: "manual", headers: { cookie: `keystone_oauth=${stateCookie}` } },
  );
  expect(callback.status).toBe(302);
  const cookie = cookieValue(callback, "keystone_session");
  const csrf = cookieValue(callback, "keystone_csrf");
  expect(cookie).toBeTruthy();
  expect(csrf).toBeTruthy();
  return { cookie: `keystone_session=${cookie}`, csrf: csrf as string };
}

describe("P6 web auth and authorization", () => {
  it("rejects a missing state cookie, wrong issuer and wrong state before exchange", async () => {
    const test = await harness();
    try {
      const noCookie = await fetch(`${test.base}/auth/callback?code=good&state=abc&iss=https://discord.com`, {
        redirect: "manual",
      });
      expect(noCookie.status).toBe(400);

      const begin = await fetch(`${test.base}/login`, { redirect: "manual" });
      const stateCookie = cookieValue(begin, "keystone_oauth") as string;
      const state = new URL(begin.headers.get("location") as string).searchParams.get("state") as string;

      const wrongIssuer = await fetch(
        `${test.base}/auth/callback?code=good&state=${encodeURIComponent(state)}&iss=https://evil.example`,
        { redirect: "manual", headers: { cookie: `keystone_oauth=${stateCookie}` } },
      );
      expect(wrongIssuer.status).toBe(400);
      expect(test.oauth.exchanges).toBe(0);

      const wrongState = await fetch(
        `${test.base}/auth/callback?code=good&state=not-the-state&iss=https://discord.com`,
        { redirect: "manual", headers: { cookie: `keystone_oauth=${stateCookie}` } },
      );
      expect(wrongState.status).toBe(400);
      expect(test.oauth.exchanges).toBe(0);
    } finally {
      await test.close();
    }
  });

  it("completes login, lists only manageable guilds and reads one real overview", async () => {
    const test = await harness();
    try {
      const { cookie } = await login(test);

      const me = await fetch(`${test.base}/api/v1/me`, { headers: { cookie } });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ user: { id: USER } });

      const guilds = await fetch(`${test.base}/api/v1/guilds`, { headers: { cookie } });
      expect(guilds.status).toBe(200);
      const guildBody = (await guilds.json()) as { guilds: Array<{ id: string; name: string }> };
      expect(guildBody.guilds.map((guild) => guild.id)).toEqual([GUILD_A, GUILD_C]);
      expect(guildBody.guilds.map((guild) => guild.id)).not.toContain(GUILD_B);

      const dashboard = await fetch(`${test.base}/dashboard`, { headers: { cookie } });
      expect(dashboard.status).toBe(200);
      const list = await dashboard.text();
      expect(list).toContain("Alpha");
      expect(list).not.toContain("Beta");

      const overview = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/overview`, {
        headers: { cookie },
      });
      expect(overview.status).toBe(200);
      const body = (await overview.json()) as {
        guild: { id: string };
        counts: { cases: number; openTickets: number };
        modules: Array<{ id: string }>;
        latestImport: { source: string } | null;
      };
      expect(body.guild.id).toBe(GUILD_A);
      expect(body.counts).toMatchObject({ cases: 3, openTickets: 2 });
      expect(body.modules.map((module) => module.id)).toEqual([
        "diagnostics",
        "setup",
        "moderation",
        "community",
        "ai",
      ]);
      expect(body.latestImport?.source).toBe("bundle");

      const html = await fetch(`${test.base}/dashboard/guilds/${GUILD_A}`, { headers: { cookie } });
      expect(html.status).toBe(200);
      const page = await html.text();
      expect(page).toContain("Alpha");
      expect(page).toContain("Cases");
      expect(page).not.toContain(ACCESS_TOKEN);
      expect(page).not.toContain(REFRESH_TOKEN);
      expect(page).toContain("&lt;script&gt;");
      expect(html.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(html.headers.get("cache-control")).toBe("no-store");
    } finally {
      await test.close();
    }
  });

  it("rejects a non-admin, a cross-guild id and a guild without the bot", async () => {
    const test = await harness();
    try {
      const { cookie } = await login(test);
      for (const guildId of [GUILD_B, GUILD_Z, GUILD_C]) {
        const response = await fetch(`${test.base}/api/v1/guilds/${guildId}/overview`, {
          headers: { cookie },
        });
        expect(response.status).toBe(403);
      }
      const unauthenticated = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/overview`);
      expect(unauthenticated.status).toBe(401);
    } finally {
      await test.close();
    }
  });

  it("uses the CSRF token for logout and invalidates the session", async () => {
    const test = await harness();
    try {
      const { cookie, csrf } = await login(test);
      const missing = await fetch(`${test.base}/logout`, { method: "POST", headers: { cookie } });
      expect(missing.status).toBe(403);

      const valid = await fetch(`${test.base}/logout`, {
        method: "POST",
        redirect: "manual",
        headers: {
          cookie: `${cookie}; keystone_csrf=${csrf}`,
          "x-keystone-csrf": csrf,
        },
      });
      expect(valid.status).toBe(302);

      const after = await fetch(`${test.base}/api/v1/me`, { headers: { cookie } });
      expect(after.status).toBe(401);
    } finally {
      await test.close();
    }
  });

  it("keeps the health route public and reports the mode without secrets", async () => {
    const test = await harness();
    try {
      const health = await fetch(`${test.base}/healthz`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as Record<string, unknown>;
      expect(body).toEqual({ ok: true, database: "memory", oauth: true });
      expect(JSON.stringify(body)).not.toContain("client-secret");
    } finally {
      await test.close();
    }
  });

  it("writes module settings through the API and the dashboard form with the bot schema", async () => {
    const test = await harness();
    try {
      const { cookie, csrf } = await login(test);
      const updated = await patchSettings(test, cookie, csrf, GUILD_A, "ai", {
        enabled: true,
        chat: true,
        monthlyBudgetUsd: 5,
      });
      expect(updated.status).toBe(200);
      const body = (await updated.json()) as { module: { id: string; settings: Record<string, unknown> } };
      expect(body.module.id).toBe("ai");
      expect(body.module.settings).toMatchObject({ enabled: true, chat: true, monthlyBudgetUsd: 5 });
      expect(await test.settings.get(GUILD_A, "ai")).toMatchObject({
        enabled: true,
        chat: true,
        monthlyBudgetUsd: 5,
        retention: "none",
      });

      const overview = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/overview`, {
        headers: { cookie },
      });
      expect(overview.status).toBe(200);
      const overviewBody = (await overview.json()) as {
        modules: Array<{ id: string; settings: Record<string, unknown> }>;
      };
      expect(overviewBody.modules.find((module) => module.id === "ai")?.settings).toMatchObject({
        enabled: true,
        chat: true,
        monthlyBudgetUsd: 5,
      });

      const editor = await fetch(`${test.base}/dashboard/guilds/${GUILD_A}/settings/ai`, {
        headers: { cookie },
      });
      expect(editor.status).toBe(200);
      const editorPage = await editor.text();
      expect(editorPage).toContain("<textarea");
      expect(editorPage).toContain("&quot;monthlyBudgetUsd&quot;: 5");

      const form = new URLSearchParams({
        csrf,
        settings: JSON.stringify({ enabled: true, chat: false, monthlyBudgetUsd: 7 }),
      });
      const saved = await fetch(`${test.base}/dashboard/guilds/${GUILD_A}/settings/ai`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      expect(saved.status).toBe(302);
      expect(await test.settings.get(GUILD_A, "ai")).toMatchObject({
        enabled: true,
        chat: false,
        monthlyBudgetUsd: 7,
      });
    } finally {
      await test.close();
    }
  });

  it("rejects invalid settings without mutating the stored values", async () => {
    const test = await harness();
    try {
      const { cookie, csrf } = await login(test);
      const before = await test.settings.get(GUILD_A, "ai");

      const invalid = await patchSettings(test, cookie, csrf, GUILD_A, "ai", {
        monthlyBudgetUsd: 5_000,
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ error: { code: "settings_invalid" } });
      expect(await test.settings.get(GUILD_A, "ai")).toEqual(before);

      const unknown = await patchSettings(test, cookie, csrf, GUILD_A, "nope", { enabled: true });
      expect(unknown.status).toBe(404);

      const missingCsrf = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/settings/ai`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      expect(missingCsrf.status).toBe(403);

      const formMissingCsrf = await fetch(`${test.base}/dashboard/guilds/${GUILD_A}/settings/ai`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ settings: JSON.stringify({ enabled: false }) }).toString(),
      });
      expect(formMissingCsrf.status).toBe(403);

      const wrongType = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/settings/ai`, {
        method: "PATCH",
        headers: { cookie, "content-type": "text/plain", "x-keystone-csrf": csrf },
        body: JSON.stringify({ enabled: false }),
      });
      expect(wrongType.status).toBe(415);
      expect(await test.settings.get(GUILD_A, "ai")).toEqual(before);
    } finally {
      await test.close();
    }
  });

  it("rejects cross-guild, non-admin and bot-absent settings writes", async () => {
    const test = await harness();
    try {
      const { cookie, csrf } = await login(test);
      for (const guildId of [GUILD_B, GUILD_Z, GUILD_C]) {
        const response = await patchSettings(test, cookie, csrf, guildId, "ai", { enabled: true });
        expect(response.status).toBe(403);
      }

      const form = new URLSearchParams({
        csrf,
        settings: JSON.stringify({ enabled: true }),
      });
      const crossGuildForm = await fetch(`${test.base}/dashboard/guilds/${GUILD_B}/settings/ai`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      expect(crossGuildForm.status).toBe(403);

      const noSession = await fetch(`${test.base}/api/v1/guilds/${GUILD_A}/settings/ai`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-keystone-csrf": csrf },
        body: JSON.stringify({ enabled: true }),
      });
      expect(noSession.status).toBe(401);
    } finally {
      await test.close();
    }
  });
});

describe("BigInt guild permissions", () => {
  it("does not treat MODERATE_MEMBERS (bit 40) as Manage Guild", () => {
    expect(canManageGuild({ owner: false, permissions: (1n << 40n).toString() })).toBe(false);
  });

  it("accepts Manage Guild, Administrator and owner", () => {
    expect(canManageGuild({ owner: false, permissions: (1n << 5n).toString() })).toBe(true);
    expect(canManageGuild({ owner: false, permissions: (1n << 3n).toString() })).toBe(true);
    expect(canManageGuild({ owner: true, permissions: "0" })).toBe(true);
  });

  it("rejects an invalid bitfield instead of throwing", () => {
    expect(canManageGuild({ owner: false, permissions: "not-a-number" })).toBe(false);
  });
});

describe("session storage", () => {
  it("stores only a hash of the session id and a sealed token", async () => {
    const store = new InMemorySessionStore();
    const raw = "browser-session-token";
    await store.create({
      id: sha256(raw),
      userId: USER,
      username: "Admin",
      accessToken: "sealed-a",
      refreshToken: "sealed-r",
      csrfHash: sha256("csrf"),
      createdAt: new Date().toISOString(),
      rotatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await store.get(raw)).toBeUndefined();
    expect(await store.get(sha256(raw))).toMatchObject({ accessToken: "sealed-a" });
  });
});
