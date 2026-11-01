import { createHash } from "node:crypto";
import type { SessionStore, WebSession } from "@keystone/kernel";
import {
  SecretBox,
  constantTimeEqual,
  openState,
  randomToken,
  sealState,
  sha256,
  type OAuthState,
} from "./crypto";
import { HttpError } from "./http-error";
import type { DiscordOAuth } from "./oauth";

export interface AuthConfig {
  /** OAuth values are optional so the server can boot in degraded local mode. */
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  issuer: string;
  sessionTtlMs: number;
}

export interface AuthDependencies {
  oauth?: DiscordOAuth;
  sessions: SessionStore;
  box: SecretBox;
  config: AuthConfig;
  now?: () => number;
}

export interface BeginResult {
  authorizationUrl: string;
  stateCookie: string;
}

export interface CompleteInput {
  code: string;
  state: string;
  iss: string;
  stateCookie: string | undefined;
}

export interface CompleteResult {
  sessionToken: string;
  csrfToken: string;
}

/**
 * OAuth2 authorization-code + PKCE with a server-side opaque session.
 *
 * `state` and the PKCE verifier live in an HttpOnly, AEAD-sealed cookie bound
 * to this one attempt. The session cookie is a random value; only its SHA-256
 * hash is stored. The Discord access token is sealed before it reaches the
 * session store and is never returned by any route. No refresh token is kept:
 * the dashboard has no refresh path, so a session simply expires and the user
 * signs in again.
 */
export class AuthService {
  private readonly now: () => number;

  constructor(private readonly deps: AuthDependencies) {
    this.now = deps.now ?? Date.now;
  }

  get oauthConfigured(): boolean {
    return Boolean(
      this.deps.oauth &&
        this.deps.config.clientId &&
        this.deps.config.clientSecret &&
        this.deps.config.redirectUri,
    );
  }

  get ttlMs(): number {
    return this.deps.config.sessionTtlMs;
  }

  private requireOAuth(): DiscordOAuth {
    const oauth = this.deps.oauth;
    if (!this.oauthConfigured || !oauth) {
      throw new HttpError(
        503,
        "The dashboard OAuth client is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_OAUTH_REDIRECT_URI.",
        "oauth_unconfigured",
      );
    }
    return oauth;
  }

  begin(): BeginResult {
    const oauth = this.requireOAuth();
    const state = randomToken(24);
    const verifier = randomToken(32);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const redirectUri = this.deps.config.redirectUri as string;
    const stateCookie = sealState(this.deps.box, {
      state,
      verifier,
      redirectUri,
      createdAt: this.now(),
    });
    return {
      authorizationUrl: oauth.authorizationUrl({ state, codeChallenge: challenge, redirectUri }),
      stateCookie,
    };
  }

  async complete(input: CompleteInput): Promise<CompleteResult> {
    const oauth = this.requireOAuth();
    if (!input.code) throw new HttpError(400, "The OAuth code is missing.", "code_missing");
    if (!input.stateCookie) throw new HttpError(400, "The OAuth state cookie is missing.", "state_missing");
    if (!input.state) throw new HttpError(400, "The OAuth state is missing.", "state_missing");
    if (input.iss !== this.deps.config.issuer) {
      throw new HttpError(400, "The OAuth issuer is not trusted.", "issuer_mismatch");
    }

    let state: OAuthState;
    try {
      state = openState(this.deps.box, input.stateCookie, this.now());
    } catch {
      throw new HttpError(400, "The OAuth state is invalid or expired.", "state_invalid");
    }
    if (!constantTimeEqual(state.state, input.state)) {
      throw new HttpError(400, "The OAuth state does not match this login attempt.", "state_mismatch");
    }
    if (state.redirectUri !== this.deps.config.redirectUri) {
      throw new HttpError(400, "The OAuth redirect URI changed during login.", "redirect_mismatch");
    }

    const tokens = await oauth.exchangeCode({
      code: input.code,
      codeVerifier: state.verifier,
      redirectUri: state.redirectUri,
    });
    const user = await oauth.fetchUser(tokens.accessToken);
    const sessionToken = randomToken(32);
    const csrfToken = randomToken(24);
    const createdAt = new Date(this.now()).toISOString();
    const session: WebSession = {
      id: sha256(sessionToken),
      userId: user.id,
      username: user.username,
      accessToken: this.deps.box.seal(tokens.accessToken),
      csrfHash: sha256(csrfToken),
      createdAt,
      expiresAt: new Date(this.now() + this.deps.config.sessionTtlMs).toISOString(),
    };
    await this.deps.sessions.create(session);
    return { sessionToken, csrfToken };
  }

  async session(sessionToken: string | undefined): Promise<WebSession | undefined> {
    if (!sessionToken) return undefined;
    const session = await this.deps.sessions.get(sha256(sessionToken));
    if (!session) return undefined;
    if (Date.parse(session.expiresAt) <= this.now()) {
      await this.deps.sessions.delete(session.id);
      return undefined;
    }
    return session;
  }

  accessToken(session: WebSession): string {
    try {
      return this.deps.box.open(session.accessToken);
    } catch {
      throw new HttpError(401, "The session is no longer usable. Sign in again.", "session_invalid");
    }
  }

  csrfValid(session: WebSession, csrfToken: string | undefined): boolean {
    return Boolean(csrfToken) && constantTimeEqual(sha256(csrfToken as string), session.csrfHash);
  }

  async logout(session: WebSession): Promise<void> {
    await this.deps.sessions.delete(session.id);
  }
}
