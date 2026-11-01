import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { SessionPatch, SessionStore, WebSession } from "@keystone/kernel";
import { webSessions } from "./schema";
import type { schema } from "./schema";

/**
 * Postgres session store.
 *
 * The browser holds a random opaque token; this table only holds its SHA-256
 * hash. Discord tokens arrive already sealed by the web layer, so this adapter
 * never needs the encryption key and cannot accidentally log a token.
 */
export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async create(session: WebSession): Promise<void> {
    await this.db.insert(webSessions).values({
      id: session.id,
      userId: session.userId,
      username: session.username,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      csrfHash: session.csrfHash,
      createdAt: new Date(session.createdAt),
      rotatedAt: new Date(session.rotatedAt),
      expiresAt: new Date(session.expiresAt),
    });
  }

  async get(id: string): Promise<WebSession | undefined> {
    const [row] = await this.db
      .select()
      .from(webSessions)
      .where(eq(webSessions.id, id))
      .limit(1);
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId,
      username: row.username,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      csrfHash: row.csrfHash,
      createdAt: row.createdAt.toISOString(),
      rotatedAt: row.rotatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async update(id: string, patch: SessionPatch): Promise<void> {
    const values: Partial<{
      accessToken: string;
      refreshToken: string | null;
      rotatedAt: Date;
      expiresAt: Date;
    }> = {};
    if (patch.accessToken !== undefined) values.accessToken = patch.accessToken;
    if (patch.refreshToken !== undefined) values.refreshToken = patch.refreshToken;
    if (patch.rotatedAt !== undefined) values.rotatedAt = new Date(patch.rotatedAt);
    if (patch.expiresAt !== undefined) values.expiresAt = new Date(patch.expiresAt);
    if (Object.keys(values).length === 0) return;
    await this.db.update(webSessions).set(values).where(eq(webSessions.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(webSessions).where(eq(webSessions.id, id));
  }
}
