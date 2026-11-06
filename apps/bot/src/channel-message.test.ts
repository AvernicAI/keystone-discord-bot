import { describe, expect, it } from "vitest";
import { MessageFlags } from "discord.js";
import { ACCENTS, GLYPHS, heading, layout } from "@keystone/ui";
import type { ModerationNotice } from "@keystone/kernel";
import { toChannelMessage } from "./adapt";

function card() {
  return layout((ui) => {
    ui.container({ accentColor: ACCENTS.brand }, (box) => {
      box.text(heading({ glyph: GLYPHS.shield, title: "Case #1 · warn", context: "this server" }));
    });
  });
}

describe("channel message conversion", () => {
  it("sends a V2 card with the flag and no content or embeds", () => {
    const options = toChannelMessage({ v2: card() });

    expect(options.flags).toBe(MessageFlags.IsComponentsV2);
    expect(options.content).toBeUndefined();
    expect(options.embeds).toBeUndefined();
    expect(options.components).toHaveLength(1);
    // JSON.stringify is the runtime path discord.js takes: it calls toJSON().
    expect(JSON.parse(JSON.stringify(options.components?.[0]))).toMatchObject({ type: 17 });
  });

  it("keeps the legacy embed shape for an embed-only notice", () => {
    const notice: ModerationNotice = {
      embeds: [{ title: "Case #1", description: "kept for old callers" }],
    };

    const options = toChannelMessage(notice);

    expect(options.flags).toBeUndefined();
    expect(options.embeds).toHaveLength(1);
    expect(options.components).toEqual([]);
  });

  it("prefers the V2 layout when a caller passes both shapes", () => {
    // The port documents them as exclusive; a caller that ignores that must not
    // produce a payload Discord rejects.
    const options = toChannelMessage({
      v2: card(),
      embeds: [{ title: "ignored" }],
    });

    expect(options.embeds).toBeUndefined();
    expect(options.flags).toBe(MessageFlags.IsComponentsV2);
  });
});
