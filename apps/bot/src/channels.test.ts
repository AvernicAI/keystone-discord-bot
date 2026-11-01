import { describe, expect, it } from "vitest";
import { isObfuscated, resolveChannel } from "./channels";

interface FakeChannel {
  id: string;
  name?: string;
  flags?: { bitfield: number };
}

function channel(overrides: Partial<FakeChannel> = {}): FakeChannel {
  return { id: "channel-1", name: "general", flags: { bitfield: 0 }, ...overrides };
}

describe("channel resolution", () => {
  it("returns a visible channel unchanged", async () => {
    const visible = channel();
    const result = await resolveChannel(async () => visible, "channel-1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.channel).toBe(visible);
  });

  it("detects the CHANNEL_OBFUSCATED flag", () => {
    expect(isObfuscated(channel({ flags: { bitfield: 1 << 17 } }))).toBe(true);
  });

  it("detects the ___hidden___ name even without the flag", async () => {
    const hidden = channel({ name: "___hidden___", flags: { bitfield: 0 } });
    expect(isObfuscated(hidden)).toBe(true);
    const result = await resolveChannel(async () => hidden, "channel-1");
    expect(result.status).toBe("hidden");
  });

  it("treats a null fetch as a missing channel", async () => {
    const result = await resolveChannel(async () => null, "channel-1");
    expect(result.status).toBe("missing");
    if (result.status === "missing") expect(result.reason).toContain("channel-1");
  });

  it("classifies unknown-channel and missing-access errors", async () => {
    const unknown = await resolveChannel(async () => {
      throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
    }, "channel-1");
    expect(unknown.status).toBe("missing");

    const denied = await resolveChannel(async () => {
      throw Object.assign(new Error("Missing Access"), { code: 50001 });
    }, "channel-1");
    expect(denied.status).toBe("hidden");

    const forbidden = await resolveChannel(async () => {
      throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
    }, "channel-1");
    expect(forbidden.status).toBe("hidden");
  });

  it("does not hide an unrelated error", async () => {
    const result = await resolveChannel(async () => {
      throw new Error("network down");
    }, "channel-1");
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("network down");
  });
});
