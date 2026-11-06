/**
 * A narrow read port for the two things an operator needs before they can fill
 * a settings form: the server's channels and its roles.
 *
 * This is a port because the dashboard has no discord.js client and must not
 * grow one. The bot token is read here, used as a header, and never returned,
 * logged or rendered. Tests inject a fake implementation; the gate stays
 * network-free.
 */

const DISCORD_API = "https://discord.com/api/v10";
const DEFAULT_TTL_MS = 60_000;

export type ChannelKind =
  | "text"
  | "voice"
  | "category"
  | "announcement"
  | "stage"
  | "forum"
  | "media"
  | "other";

export interface DirectoryChannel {
  readonly id: string;
  readonly name: string;
  readonly kind: ChannelKind;
  readonly parentId: string | null;
  readonly position: number;
}

export interface DirectoryRole {
  readonly id: string;
  readonly name: string;
  /** Discord's integer colour; 0 means the default role colour. */
  readonly color: number;
  readonly position: number;
  readonly managed: boolean;
  /** True for roles a bot or integration owns; they cannot be assigned. */
  readonly hoist: boolean;
}

export interface GuildDirectory {
  /** The server this read belongs to; @everyone is the role with this id. */
  readonly guildId: string;
  readonly channels: readonly DirectoryChannel[];
  readonly roles: readonly DirectoryRole[];
  readonly fetchedAt: string;
}

export interface DirectoryPort {
  guildResources(guildId: string): Promise<GuildDirectory>;
}

/** A directory read that failed for a reason the page can explain. */
export class DirectoryError extends Error {
  constructor(
    message: string,
    readonly unavailable = false,
  ) {
    super(message);
    this.name = "DirectoryError";
  }
}

const CHANNEL_KINDS: Record<number, ChannelKind> = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum",
  16: "media",
};

export function channelKind(type: number): ChannelKind {
  return CHANNEL_KINDS[type] ?? "other";
}

interface RawChannel {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  parent_id?: unknown;
  position?: unknown;
}

interface RawRole {
  id?: unknown;
  name?: unknown;
  color?: unknown;
  position?: unknown;
  managed?: unknown;
  hoist?: unknown;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Cached Discord REST client. One page load costs two requests at most; a
 * second manager loading the same page inside a minute reads the cache.
 */
export class DiscordDirectoryClient implements DirectoryPort {
  private readonly cache = new Map<string, { readonly expiresAt: number; readonly value: GuildDirectory }>();

  constructor(
    private readonly options: {
      readonly token: string;
      readonly fetchImpl?: typeof fetch;
      readonly ttlMs?: number;
      readonly now?: () => number;
    },
  ) {}

  async guildResources(guildId: string): Promise<GuildDirectory> {
    const now = this.options.now?.() ?? Date.now();
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > now) return cached.value;

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = {
      Authorization: `Bot ${this.options.token}`,
      "User-Agent": "Keystone/0.1.0 (dashboard directory read)",
      Accept: "application/json",
    };
    const [channelsResponse, rolesResponse] = await Promise.all([
      fetchImpl(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/channels`, { headers }),
      fetchImpl(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/roles`, { headers }),
    ]);

    await this.assertReadable(channelsResponse);
    await this.assertReadable(rolesResponse);

    const channelsJson = (await channelsResponse.json()) as unknown;
    const rolesJson = (await rolesResponse.json()) as unknown;
    if (!Array.isArray(channelsJson) || !Array.isArray(rolesJson)) {
      throw new DirectoryError("Discord returned an unexpected shape for this server.");
    }

    const channels = channelsJson
      .map((entry): DirectoryChannel | null => {
        const raw = entry as RawChannel;
        const id = stringField(raw.id);
        const name = stringField(raw.name);
        if (!id || name === null) return null;
        return {
          id,
          name,
          kind: channelKind(numberField(raw.type)),
          parentId: stringField(raw.parent_id),
          position: numberField(raw.position),
        };
      })
      .filter((entry): entry is DirectoryChannel => entry !== null)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    const roles = rolesJson
      .map((entry): DirectoryRole | null => {
        const raw = entry as RawRole;
        const id = stringField(raw.id);
        const name = stringField(raw.name);
        if (!id || name === null) return null;
        return {
          id,
          name,
          color: numberField(raw.color),
          position: numberField(raw.position),
          managed: raw.managed === true,
          hoist: raw.hoist === true,
        };
      })
      .filter((entry): entry is DirectoryRole => entry !== null)
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));

    const value: GuildDirectory = {
      guildId,
      channels,
      roles,
      fetchedAt: new Date(now).toISOString(),
    };
    this.cache.set(guildId, {
      expiresAt: now + (this.options.ttlMs ?? DEFAULT_TTL_MS),
      value,
    });
    return value;
  }

  private async assertReadable(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status === 403 || response.status === 404) {
      throw new DirectoryError(
        "Keystone cannot read this server's channels and roles. Check that the bot is still in the server and can View Channels.",
        true,
      );
    }
    if (response.status === 429) {
      throw new DirectoryError(
        "Discord is rate-limiting the directory read. The page will work again shortly; no setting was changed.",
      );
    }
    throw new DirectoryError(`Discord returned HTTP ${response.status} while reading this server.`);
  }
}
