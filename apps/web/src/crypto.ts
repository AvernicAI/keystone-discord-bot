import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Web crypto helpers.
 *
 * Two separate jobs:
 * 1. Seal Discord tokens and the OAuth state cookie with AES-256-GCM.
 * 2. Hash session and CSRF tokens before storage, so a database leak is not a
 *    session leak.
 *
 * No key is ever embedded in this file. `SESSION_SECRET` is operator input;
 * local mode may generate an ephemeral key and warns that sessions reset.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function base64url(value: Buffer): string {
  return value.toString("base64url");
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseSessionSecret(value: string): Buffer {
  const trimmed = value.trim();
  const candidates: Buffer[] = [];
  if (/^[0-9a-f]{64}$/i.test(trimmed)) candidates.push(Buffer.from(trimmed, "hex"));
  candidates.push(Buffer.from(trimmed, "base64url"));
  candidates.push(Buffer.from(trimmed, "base64"));

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new Error("SESSION_SECRET must be 32 bytes encoded as base64, base64url or 64 hex characters.");
  }
  return key;
}

export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("SecretBox needs a 32-byte key.");
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, base64url(iv), base64url(tag), base64url(ciphertext)].join(".");
  }

  open(sealed: string): string {
    const [version, ivPart, tagPart, cipherPart] = sealed.split(".");
    if (version !== VERSION || !ivPart || !tagPart || !cipherPart) {
      throw new Error("Unsupported sealed value.");
    }
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(cipherPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Invalid sealed value.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

export interface OAuthState {
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

export function sealState(box: SecretBox, state: OAuthState): string {
  return box.seal(JSON.stringify(state));
}

export function openState(box: SecretBox, sealed: string, now: number, maxAgeMs = 10 * 60_000): OAuthState {
  const raw = JSON.parse(box.open(sealed)) as Partial<OAuthState>;
  if (
    typeof raw.state !== "string" ||
    typeof raw.verifier !== "string" ||
    typeof raw.redirectUri !== "string" ||
    typeof raw.createdAt !== "number"
  ) {
    throw new Error("Invalid OAuth state.");
  }
  if (now - raw.createdAt > maxAgeMs || raw.createdAt > now + 60_000) {
    throw new Error("OAuth state has expired.");
  }
  return { state: raw.state, verifier: raw.verifier, redirectUri: raw.redirectUri, createdAt: raw.createdAt };
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
