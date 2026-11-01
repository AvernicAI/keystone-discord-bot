# Dashboard and API

> Security contract: [[Dashboard-Security]]. Decision: [[ADR-0016-dashboard-foundation]].
> The dashboard is a separate process from the gateway; it reads and writes
> guild settings through the kernel ports and never imports discord.js.

## What runs today

`apps/web` is a Node HTTP service with no UI framework. It proves the part that
matters first: **who is allowed to see or change which guild**.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /healthz` | public | Liveness, database mode, OAuth configured or not; no secrets |
| `GET /` | public | Landing/sign-in page |
| `GET /login` | public | Starts OAuth2 code + PKCE; sets the sealed state cookie; `503` without OAuth config |
| `GET /auth/callback` | state cookie | Validates `state` and `iss`, exchanges the code, creates the session |
| `POST /logout` | session + CSRF | Deletes the server-side session and clears cookies |
| `GET /dashboard` | session | Guilds the user can manage |
| `GET /dashboard/guilds/:id` | session + guild authz | Overview page |
| `GET /dashboard/guilds/:id/settings/:module` | session + guild authz | Settings editor for one registered module |
| `POST /dashboard/guilds/:id/settings/:module` | session + guild authz + CSRF | Save the editor's JSON through the module schema |
| `GET /api/v1/me` | session | The signed-in user; never a token |
| `GET /api/v1/guilds` | session | Manageable guilds only |
| `GET /api/v1/guilds/:id/overview` | session + guild authz | Counts, module settings, latest import |
| `PATCH /api/v1/guilds/:id/settings/:module` | session + guild authz + CSRF | Update one module; JSON body |

Every response carries `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Cross-Origin-Opener-Policy` and a restrictive CSP.
Authenticated responses are `Cache-Control: no-store`.

## The request path

```text
browser
  │  keystone_session cookie (random opaque value)
  ▼
AuthService.session(sha256(cookie))
  │  WebSession { sealed Discord access token, csrf hash, expiry }
  ▼
GuildAccessService.authorize(accessToken, :guildId)
  │  1. user owner/admin/manage-guild?  (BigInt bitfield)
  │  2. bot in guild?                  (bot token)
  ▼
DashboardService.view(guild)          DashboardService.update(guild, module, patch)
  │  SettingsService + DashboardStore    │  SettingsService.update
  ▼                                     ▼
HTML or JSON; no Discord token in either
```

Both branches use the same `GuildAccessService.authorize()` result. There is no
separate "write permission" cache and no web-only settings schema. The write
branch additionally checks the session CSRF token before it parses the body.

The guild list is fetched from Discord on each request, so a demotion or removal
takes effect immediately. There is no browser-held permission cache. A
sub-resource in a later write route must be checked against the authorized guild
as well; the URL id alone is never enough.

## Where the code lives

| File | Owns |
| --- | --- |
| `apps/web/src/crypto.ts` | AES-256-GCM sealing, session/CSRF hashing, state expiry |
| `apps/web/src/oauth.ts` | The only Discord URL/HTTP adapter; a port for tests |
| `apps/web/src/auth.ts` | OAuth completion, opaque sessions, CSRF |
| `apps/web/src/access.ts` | BigInt permissions and the bot-membership check |
| `apps/web/src/overview.ts` | View composition, settings update and schema-error mapping; filters credential-shaped settings |
| `apps/web/src/server.ts` | Routes, cookies, CSP, HTML escaping, JSON errors |
| `apps/web/src/runtime.ts` | Composition root: Postgres or memory, OAuth or degraded |
| `packages/kernel/src/web.ts` | `SessionStore`, `DashboardStore`, `WebSession` |
| `packages/db/src/web-session-store.ts` | Drizzle session adapter |
| `packages/db/src/web-dashboard-store.ts` | Guild-scoped aggregate read model |
| `packages/module-catalog` | The one module list shared with the bot |

The kernel owns the contracts; `packages/db` owns SQL; `apps/web` owns HTTP and
rendering. That is why the tests can run without a Discord token, a Postgres
server or a browser.

## How to add a read route

1. Decide which port it needs. Prefer an existing store; add a method to
   `DashboardStore` rather than SQL in `server.ts`.
2. Call `requireSession()` and, for anything guild-scoped,
   `deps.access.authorize(accessToken, guildId)` before reading data.
3. Compose the response in `DashboardService` or a sibling service; keep
   `server.ts` to routing, parsing and escaping.
4. Escape every Discord-supplied string in HTML. Never interpolate raw JSON into
   a `<script>` tag.
5. Add a test in `apps/web/src/web.test.ts` that proves a cross-guild request is
   `403` and that the body contains no sealed token.
6. Add the route to this table and to the README feature list; update the pass
   journal and feature status.

## How to add a write route

1. Authorize first: `requireSession()` and
   `deps.access.authorize(accessToken, guildId)` before reading the body. A
   non-admin must not be able to probe validation behaviour.
2. Check CSRF before a mutation: `auth.csrfValid(session, csrfHeader(req))` for
   JSON, or the hidden `csrf` field for a form.
3. Validate through the module's existing schema via `SettingsService.update`.
   Do not add a second schema, a web-only whitelist or a direct repository write.
4. Keep the write guild-scoped: call `SettingsService.update(guild.id, ...)` with
   the guild returned by `authorize()`, never a guild id read from the body.
5. Return a safe view: `DashboardService` filters credential-shaped setting keys
   before returning HTML or JSON.
6. Test all four refusals in `apps/web/src/web.test.ts`: cross-guild, non-admin,
   bot absent and bad/missing CSRF, plus validation failure with no mutation.

## Deliberately not done yet

- Schema-driven **field widgets**; the current editor is a validated JSON
  textarea so it can cover every existing module setting without a second
  settings concept.
- A fleet view with bulk actions and templates.
- Token refresh/rotation, Discord token revocation on logout, idle timeout.
  No refresh token is stored until that path exists; the session re-authenticates
  when its access token expires.
- Public API tokens (`keystone_…`), scopes, per-token rate limits,
  `Idempotency-Key`, webhooks and an OpenAPI document.
- Live OAuth against Discord and a Postgres-backed session smoke.

The kill signal in [[Roadmap]] says read-only first if the authorization matrix
cannot pass. That step is done; settings writes now reuse the same gate. This is
still not the full P6 exit demo.
