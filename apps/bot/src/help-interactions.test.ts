import { describe, expect, it } from "vitest";
import {
  ComponentRouter,
  createComponentSigner,
  type CommandCatalogEntry,
  type ComponentInteractionLike,
  type ConfigPort,
  type ReplyInput,
} from "@keystone/kernel";
import {
  HELP_PANEL_TTL_MS,
  registerHelpRoutes,
  type HelpRouteDeps,
} from "./help-interactions";

const NOW = 1_800_000_000_000;
const GUILD = "guild-1";

function entry(name: string, moduleId: string, subcommands: string[]): CommandCatalogEntry {
  return {
    name,
    moduleId,
    description: `${name} root`,
    options: [],
    subcommands: subcommands.map((subcommand) => ({
      name: subcommand,
      description: `${subcommand} action`,
      options: [],
    })),
  };
}

const catalog = [
  entry("mod", "moderation", ["ban", "kick"]),
  entry("event", "events", ["create", "rsvp"]),
];

class FakeComponent implements ComponentInteractionLike {
  readonly kind: "button" | "select";
  readonly customId: string;
  readonly guildId: string | null;
  readonly channelId = "chan-1";
  readonly userId = "user-1";
  readonly permissions: readonly string[];
  readonly values?: readonly string[];
  readonly fields?: Readonly<Record<string, string>>;
  readonly replies: ReplyInput[] = [];
  readonly updates: ReplyInput[] = [];
  #replied = false;

  constructor(init: {
    kind?: "button" | "select";
    customId: string;
    guildId?: string | null;
    permissions?: string[];
    values?: string[];
  }) {
    this.kind = init.kind ?? "button";
    this.customId = init.customId;
    this.guildId = init.guildId === undefined ? GUILD : init.guildId;
    this.permissions = init.permissions ?? [];
    this.values = init.values;
  }

  get replied(): boolean {
    return this.#replied;
  }

  async reply(input: ReplyInput): Promise<unknown> {
    this.#replied = true;
    this.replies.push(input);
    return undefined;
  }

  async update(input: ReplyInput): Promise<unknown> {
    this.updates.push(input);
    return undefined;
  }
}

function fixture(): {
  router: ComponentRouter;
  signer: ReturnType<typeof createComponentSigner>;
  signed: (action: string, ttlMs?: number) => string;
} {
  const signer = createComponentSigner("help-route-test");
  const deps: HelpRouteDeps = {
    signer,
    catalog,
    config: {
      list: async () => [
        { id: "moderation", name: "Moderation", settings: { enabled: true } },
        { id: "events", name: "Events", settings: { enabled: false } },
      ],
    } as unknown as ConfigPort,
    health: {
      probe: async () => ({
        database: { configured: true, reachable: true, migrated: true },
        cache: { configured: true, reachable: true, detail: "memory" },
      }),
    },
    moderation: {
      cases: {
        list: async () => [],
      },
    },
    community: {
      store: {
        listTickets: async () => [{ state: "open" }],
      },
    },
    now: () => NOW,
  } as unknown as HelpRouteDeps;
  const router = new ComponentRouter();
  registerHelpRoutes(router, deps);
  return {
    router,
    signer,
    signed: (action, ttlMs = HELP_PANEL_TTL_MS) =>
      signer.sign({ namespace: "help", action, ttlMs }, NOW),
  };
}

describe("help component routes", () => {
  it("updates the picker from a module select with a fresh signed page", async () => {
    const { router, signer, signed } = fixture();
    const interaction = new FakeComponent({
      kind: "select",
      customId: signed("browse"),
      values: ["moderation"],
    });

    expect(await router.dispatch(interaction, signer, NOW)).toBe(true);

    expect(interaction.replies).toHaveLength(0);
    expect(interaction.updates).toHaveLength(1);
    const panel = interaction.updates[0]?.v2;
    const json = JSON.stringify(panel);
    expect(json).toContain("## Moderation");
    expect(json).toContain("`ban`");
    expect(json).not.toContain("## Events");

    // The update carries a signed id minted for this render. Signing is
    // deterministic within one second, so validity — not inequality — is the
    // property worth asserting.
    const fresh = interaction.updates[0]?.v2
      ?.flatMap((component) =>
        component.type === "container" ? component.components : [component],
      )
      .flatMap((component) =>
        component.type === "action-row" ? component.components : [],
      )
      .find((component) => component.type === "select");
    if (fresh?.type !== "select") throw new Error("expected a select");
    expect(fresh.options.map((option) => option.value)).toEqual([
      "moderation",
      "events",
    ]);
    expect(signer.parse(fresh.customId, NOW).ok).toBe(true);
  });

  it("returns to Overview from a module page and renders privacy", async () => {
    const { router, signer, signed } = fixture();

    const home = new FakeComponent({ customId: signed("home") });
    expect(await router.dispatch(home, signer, NOW)).toBe(true);
    expect(JSON.stringify(home.updates[0]?.v2)).toContain("**This server**");

    const privacy = new FakeComponent({ customId: signed("privacy") });
    expect(await router.dispatch(privacy, signer, NOW)).toBe(true);
    expect(JSON.stringify(privacy.updates[0]?.v2)).toContain("Data and privacy");
  });

  it("refuses an unknown module without writing a panel", async () => {
    const { router, signer, signed } = fixture();
    const interaction = new FakeComponent({
      kind: "select",
      customId: signed("browse"),
      values: ["not-a-module"],
    });

    expect(await router.dispatch(interaction, signer, NOW)).toBe(true);
    expect(interaction.updates).toHaveLength(0);
    expect(interaction.replies[0]?.ephemeral).toBe(true);
    expect(interaction.replies[0]?.content).toContain("No module named");
  });

  it("refuses an expired id and a guild-less click", async () => {
    const { router, signer, signed } = fixture();
    const expired = new FakeComponent({ customId: signed("browse", 1_000) });
    expect(await router.dispatch(expired, signer, NOW + 2_000)).toBe(true);
    expect(expired.replies[0]?.content).toContain("expired");
    expect(expired.updates).toHaveLength(0);

    const direct = new FakeComponent({ customId: signed("home"), guildId: null });
    expect(await router.dispatch(direct, signer, NOW)).toBe(true);
    expect(direct.replies[0]?.content).toContain("inside a server");
  });

  it("leaves an id from another feature unhandled", async () => {
    const { router, signer } = fixture();
    const foreign = new FakeComponent({ customId: "keystone:legacy" });
    expect(await router.dispatch(foreign, signer, NOW)).toBe(false);
    expect(foreign.replies).toHaveLength(0);
  });
});
