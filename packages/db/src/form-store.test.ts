import { afterEach, describe, expect, it } from "vitest";
import { createMigratedPglite, type PgliteHarness } from "./testing";
import { DrizzleFormStore } from "./form-store";

let harness: PgliteHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const fields = [
  { key: "why", label: "Why join", required: true, maxLength: 500 },
  { key: "tz", label: "Timezone", required: true, maxLength: 500 },
];

async function store(): Promise<{ store: DrizzleFormStore; harness: PgliteHarness }> {
  const created = await createMigratedPglite();
  return { store: new DrizzleFormStore(created.db), harness: created };
}

describe("SQL form store", () => {
  it("enforces the guild-scoped key and resolves by key or id", async () => {
    const setup = await store();
    harness = setup.harness;

    const result = await setup.store.createForm({
      guildId: "guild-a",
      key: "staff",
      name: "Staff application",
      description: "Join the team",
      fields,
      state: "draft",
      createdBy: "mod-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await setup.store.getForm("guild-a", "staff")).toMatchObject({ id: result.form.id });
    expect(await setup.store.getForm("guild-a", result.form.id)).toMatchObject({ key: "staff" });
    expect(await setup.store.getForm("guild-b", "staff")).toBeUndefined();

    const duplicate = await setup.store.createForm({
      guildId: "guild-a",
      key: "staff",
      name: "Another",
      description: "",
      fields,
      state: "draft",
      createdBy: "mod-2",
    });
    expect(duplicate).toEqual({ ok: false, reason: "duplicate-key" });
    expect(await setup.store.listForms("guild-a")).toHaveLength(1);

    const updated = await setup.store.updateForm("guild-a", result.form.id, {
      state: "open",
      panelChannelId: "channel-9",
    });
    expect(updated).toMatchObject({ state: "open", panelChannelId: "channel-9" });

    const rows = await harness.runner.query<{ key: string; state: string }>(
      "select key, state from forms where guild_id = 'guild-a'",
    );
    expect(rows).toEqual([{ key: "staff", state: "open" }]);
  });

  it("allows one pending submission and only reviews a submitted row", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await setup.store.createForm({
      guildId: "guild-a",
      key: "staff",
      name: "Staff application",
      description: "",
      fields,
      state: "open",
      createdBy: "mod-1",
    });
    if (!created.ok) throw new Error("form was not created");

    const first = await setup.store.createSubmission({
      guildId: "guild-a",
      formId: created.form.id,
      userId: "member-1",
      answers: { why: "Hello", tz: "UTC" },
    });
    expect(first.ok).toBe(true);

    const duplicate = await setup.store.createSubmission({
      guildId: "guild-a",
      formId: created.form.id,
      userId: "member-1",
      answers: { why: "Again", tz: "UTC" },
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.existing.answers.why).toBe("Hello");

    expect(await setup.store.countSubmissions("guild-a", created.form.id)).toBe(1);
    expect(await setup.store.listSubmissions("guild-a", { state: "submitted" })).toHaveLength(1);
    expect(await setup.store.listSubmissions("guild-b")).toHaveLength(0);

    const reviewed = await setup.store.reviewSubmission(
      "guild-a",
      duplicate.existing.id,
      "mod-1",
      "accepted",
      "Strong",
    );
    expect(reviewed).toMatchObject({ state: "accepted", reviewedBy: "mod-1", decisionNote: "Strong" });
    expect(
      await setup.store.reviewSubmission("guild-a", duplicate.existing.id, "mod-1", "denied"),
    ).toBeUndefined();

    const again = await setup.store.createSubmission({
      guildId: "guild-a",
      formId: created.form.id,
      userId: "member-1",
      answers: { why: "Second try", tz: "UTC" },
    });
    expect(again.ok).toBe(true);
    expect(await setup.store.countSubmissions("guild-a", created.form.id)).toBe(2);
  });

  it("deletes a form and its submissions in one cascade", async () => {
    const setup = await store();
    harness = setup.harness;
    const created = await setup.store.createForm({
      guildId: "guild-a",
      key: "staff",
      name: "Staff application",
      description: "",
      fields,
      state: "open",
      createdBy: "mod-1",
    });
    if (!created.ok) throw new Error("form was not created");
    await setup.store.createSubmission({
      guildId: "guild-a",
      formId: created.form.id,
      userId: "member-1",
      answers: { why: "Hello", tz: "UTC" },
    });

    expect(await setup.store.deleteForm("guild-a", created.form.id)).toBe(true);
    expect(await harness.runner.query("select * from forms")).toHaveLength(0);
    expect(await harness.runner.query("select * from form_submissions")).toHaveLength(0);
  });
});
