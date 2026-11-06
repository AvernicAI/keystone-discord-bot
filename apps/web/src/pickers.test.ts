import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { GuildDirectory } from "./directory";
import { renderSettingsEditor } from "./render";
import { buildSettingsForm, referenceChoices, type SettingsField } from "./settings-form";

const GUILD_ID = "1450130465146142785";

const directory: GuildDirectory = {
  guildId: GUILD_ID,
  channels: [
    { id: "ch-general", name: "general", kind: "text", parentId: null, position: 1 },
    { id: "cat-mod", name: "Moderation", kind: "category", parentId: null, position: 2 },
    { id: "ch-logs", name: "mod-logs", kind: "text", parentId: "cat-mod", position: 3 },
    { id: "ch-voice", name: "Lounge", kind: "voice", parentId: "cat-mod", position: 4 },
    { id: "ch-orphan", name: "archived", kind: "text", parentId: "cat-gone", position: 5 },
  ],
  roles: [
    { id: GUILD_ID, name: "@everyone", color: 0, position: 0, managed: false, hoist: false },
    { id: "role-mod", name: "Moderator", color: 0x5865f2, position: 5, managed: false, hoist: true },
    { id: "role-bot", name: "Keystone", color: 0, position: 3, managed: true, hoist: false },
  ],
  fetchedAt: "2026-11-06T00:00:00.000Z",
};

const schema = z.object({
  logging: z
    .object({
      channelId: z.string().optional(),
      alertRoleId: z.string().optional(),
    })
    .default({}),
  djRoleIds: z.string().optional(),
});

function field(name: string, values: Record<string, unknown> = {}): SettingsField {
  const parsed = schema.parse(values);
  const form = buildSettingsForm(schema, parsed);
  const found = form.fields.find((entry) => entry.path === name);
  if (!found) throw new Error(`no field ${name}`);
  return found;
}

function render(values: Record<string, unknown> = {}, options: { directory?: GuildDirectory; directoryError?: string } = {}): string {
  const parsed = schema.parse(values);
  return renderSettingsEditor(
    "operator",
    { id: GUILD_ID, name: "Keystone Lab", icon: null, owner: true, permissions: "0" },
    {
      id: "logging",
      name: "Logging",
      description: "Where events go.",
      version: "0.1.0",
      enabled: true,
      commandCount: 1,
      settings: parsed,
    },
    buildSettingsForm(schema, parsed),
    "csrf-token",
    options,
  );
}

describe("reference metadata", () => {
  it("marks only single-id string keys as references", () => {
    expect(field("logging.channelId").reference).toBe("channel");
    expect(field("logging.alertRoleId").reference).toBe("role");
    // A comma-separated list is not one object; a picker would drop entries.
    expect(field("djRoleIds").reference).toBeUndefined();
    expect(field("djRoleIds").kind).toBe("text");
  });

  it("keeps the schema's own label so the picker reads like the slash command", () => {
    expect(field("logging.channelId")).toMatchObject({
      kind: "text",
      label: "Channel ID",
      reference: "channel",
    });
  });
});

describe("reference choices", () => {
  it("groups channels by category with a glyph that matches the channel type", () => {
    const choices = referenceChoices(field("logging.channelId"), directory);
    expect(choices).toEqual([
      { value: "ch-general", label: "# general", group: "No category" },
      // Its parent was deleted, or is not a category this read returned; it
      // must still be pickable rather than silently disappear.
      { value: "ch-orphan", label: "# archived", group: "No category" },
      { value: "ch-logs", label: "# mod-logs", group: "Moderation" },
      { value: "ch-voice", label: "🔊 Lounge", group: "Moderation" },
    ]);
  });

  it("offers @everyone and assignable roles, never a managed role", () => {
    const choices = referenceChoices(field("logging.alertRoleId"), directory);
    expect(choices.map((choice) => choice.value)).toEqual([GUILD_ID, "role-mod"]);
    expect(choices.map((choice) => choice.label)).toEqual(["@everyone", "@Moderator"]);
  });
});

describe("settings editor pickers", () => {
  it("renders a select with optgroups when the directory read succeeded", () => {
    const html = render({ logging: { channelId: "ch-logs" } }, { directory });
    expect(html).toContain('<optgroup label="No category">');
    expect(html).toContain('<optgroup label="Moderation">');
    expect(html).toContain('<option value="ch-logs" selected># mod-logs</option>');
    expect(html).toContain('<option value="ch-voice">🔊 Lounge</option>');
  });

  it("keeps an id that the current read does not contain, selected and labelled", () => {
    const html = render({ logging: { channelId: "ch-deleted" } }, { directory });
    expect(html).toContain('<option value="ch-deleted" selected>⚠ ch-deleted · not in this server</option>');
  });

  it("falls back to a text input and names the Directory page when no read is possible", () => {
    const html = render();
    expect(html).toContain('<input type="text" id="f-logging-channelId"');
    expect(html).not.toContain('<select id="f-logging-channelId"');
    expect(html).toContain("This process cannot read the server directory");
    expect(html).toContain("Directory</a>");
  });

  it("explains a failed read without hiding the ids", () => {
    const html = render(
      { logging: { channelId: "ch-logs" } },
      { directoryError: "Discord is rate-limiting the directory read." },
    );
    expect(html).toContain("Discord is rate-limiting the directory read.");
    expect(html).toContain('<input type="text" id="f-logging-channelId"');
    expect(html).toContain('value="ch-logs"');
  });
});
