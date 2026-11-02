import { UserError } from "@keystone/kernel";
import type {
  FormDefinition,
  FormFieldDefinition,
  FormState,
  FormStore,
  FormSubmission,
} from "@keystone/kernel";
import type { FormSettings } from "./settings";

const FIELD_KEY = /^[a-z][a-z0-9-]{0,31}$/;
const FORM_KEY = /^[a-z][a-z0-9-]{0,31}$/;
const ACTIVE_STATES = new Set(["draft", "open", "closed"]);

/** Turn a display label into the stable answer key shown on the panel. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Parse `key:Label, other:Another label` into validated fields.
 *
 * A bare label derives its key. Every field is required: optional fields are a
 * real product decision, but a half-optional form is worse than a small one,
 * and `/form edit` can add a field later.
 */
export function parseFieldSpec(
  raw: string,
  maxFields: number,
  maxAnswerLength: number,
): FormFieldDefinition[] {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new UserError("List at least one field, e.g. `why:Why join, tz:Timezone`.");
  if (tokens.length > maxFields) {
    throw new UserError(`A form can have at most ${maxFields} fields.`);
  }

  const fields: FormFieldDefinition[] = [];
  const keys = new Set<string>();
  for (const token of tokens) {
    const separator = token.indexOf(":");
    const explicitKey = separator > 0 ? token.slice(0, separator).trim() : undefined;
    const label = (separator > 0 ? token.slice(separator + 1) : token).trim();
    if (!label) throw new UserError(`Field "${token}" has no label.`);

    const key = slugify(explicitKey ?? label);
    if (!FORM_KEY.test(key)) {
      throw new UserError(
        `Field "${label}" needs an explicit key starting with a letter, e.g. \`why:${label}\`.`,
      );
    }
    if (!FIELD_KEY.test(key)) throw new UserError(`Invalid field key "${key}".`);
    if (keys.has(key)) throw new UserError(`Field key "${key}" is used twice.`);
    keys.add(key);

    fields.push({ key, label, required: true, maxLength: maxAnswerLength });
  }
  return fields;
}

/**
 * Parse `key=value; key=value` (newlines also separate) against a form.
 * Unknown keys are rejected rather than stored: a typo that silently produces
 * an empty answer is exactly the failure a review queue must not hide.
 */
export function parseAnswers(
  raw: string,
  fields: readonly FormFieldDefinition[],
): Record<string, string> {
  const answers: Record<string, string> = {};
  const asked = new Map(fields.map((field) => [field.key, field]));

  for (const part of raw.split(/\r?\n|;/)) {
    const token = part.trim();
    if (!token) continue;
    const equals = token.indexOf("=");
    if (equals <= 0) {
      throw new UserError(`Expected \`key=value\`, got \`${token}\`.`);
    }
    const key = token.slice(0, equals).trim().toLowerCase();
    const value = token.slice(equals + 1).trim();
    const field = asked.get(key);
    if (!field) {
      throw new UserError(
        `Unknown field \`${key}\`. This form asks for: ${fields.map((entry) => entry.key).join(", ")}.`,
      );
    }
    if (Object.hasOwn(answers, key)) throw new UserError(`Field \`${key}\` was answered twice.`);
    if (!value && field.required) throw new UserError(`Field \`${key}\` is required.`);
    if (value.length > field.maxLength) {
      throw new UserError(`Field \`${key}\` must be ${field.maxLength} characters or fewer.`);
    }
    if (value) answers[key] = value;
  }

  const missing = fields
    .filter((field) => field.required && !answers[field.key])
    .map((field) => field.key);
  if (missing.length > 0) {
    throw new UserError(`Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }
  return answers;
}

export interface FormSummary {
  readonly form: FormDefinition;
  readonly submissions: number;
}

export interface PendingReview {
  readonly submission: FormSubmission;
  readonly form: FormDefinition;
}

export interface FormExport {
  readonly format: "keystone.forms";
  readonly version: 1;
  readonly guildId: string;
  readonly generatedAt: string;
  readonly counts: { forms: number; submissions: number };
  readonly forms: readonly FormDefinition[];
  readonly submissions: readonly FormSubmission[];
}

/**
 * The state machine behind `/form`. Commands format; this class decides.
 *
 * Rules that do not live in the store because they need settings: form cap,
 * enabled switch, open gate, per-form submission cap. Rules that do live in the
 * store because they are invariants: unique key, one pending submission per
 * member, only `submitted` rows can be reviewed.
 */
export class FormService {
  constructor(
    private readonly store: FormStore,
    private readonly settings: FormSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async create(
    guildId: string,
    actorId: string,
    input: { name: string; key?: string; description?: string; fields: string },
  ): Promise<FormDefinition> {
    this.#requireEnabled("create a form");
    const existing = await this.store.listForms(guildId, 100);
    if (existing.length >= this.settings.maxForms) {
      throw new UserError(`This server already has ${this.settings.maxForms} forms. Delete an unused one first.`);
    }

    const name = input.name.trim();
    if (!name) throw new UserError("Give the form a name.");
    const key = (input.key?.trim() ? slugify(input.key) : slugify(name));
    if (!FORM_KEY.test(key)) {
      throw new UserError("The form key must start with a letter and use letters, digits or dashes.");
    }
    if (existing.some((form) => form.key === key)) {
      throw new UserError(`A form with key \`${key}\` already exists.`);
    }

    const fields = parseFieldSpec(input.fields, this.settings.maxFields, this.settings.maxAnswerLength);
    const result = await this.store.createForm({
      guildId,
      key,
      name,
      description: input.description?.trim() ?? "",
      fields,
      state: "draft",
      createdBy: actorId,
    });
    if (!result.ok) throw new UserError(`A form with key \`${key}\` already exists.`);
    return result.form;
  }

  async edit(
    guildId: string,
    reference: string,
    patch: { name?: string; description?: string; fields?: string; state?: string },
  ): Promise<FormDefinition> {
    const form = await this.#resolve(guildId, reference);
    const state = patch.state?.trim();
    if (state && !ACTIVE_STATES.has(state)) {
      throw new UserError("State must be draft, open or closed.");
    }
    const fields = patch.fields
      ? parseFieldSpec(patch.fields, this.settings.maxFields, this.settings.maxAnswerLength)
      : undefined;
    const name = patch.name?.trim();
    if (name !== undefined && !name) throw new UserError("The form name cannot be empty.");

    const updated = await this.store.updateForm(guildId, form.id, {
      name: name || undefined,
      description: patch.description?.trim(),
      fields,
      state: state as FormState | undefined,
    });
    if (!updated) throw new UserError(`Form \`${form.key}\` was not found.`);
    return updated;
  }

  async remove(guildId: string, reference: string, confirm: string): Promise<FormDefinition> {
    const form = await this.#resolve(guildId, reference);
    if (confirm.trim() !== form.key) {
      throw new UserError(`Refusing to delete. Pass confirm:${form.key} to remove this form.`);
    }
    const submissions = await this.store.countSubmissions(guildId, form.id);
    if (submissions > 0) {
      throw new UserError(
        `Form \`${form.key}\` has ${submissions} submission${submissions === 1 ? "" : "s"}. Close it with \`/form edit form:${form.key} state:closed\` instead; history is never deleted here.`,
      );
    }
    const deleted = await this.store.deleteForm(guildId, form.id);
    if (!deleted) throw new UserError(`Form \`${form.key}\` was not found.`);
    return form;
  }

  async list(guildId: string): Promise<FormSummary[]> {
    const forms = await this.store.listForms(guildId, 100);
    return Promise.all(
      forms.map(async (form) => ({
        form,
        submissions: await this.store.countSubmissions(guildId, form.id),
      })),
    );
  }

  /** The panel is only public for an open form; a draft has nothing to apply to. */
  async panelForm(guildId: string, reference: string): Promise<FormDefinition> {
    const form = await this.#resolve(guildId, reference);
    if (form.state !== "open") {
      throw new UserError(`Form \`${form.key}\` is ${form.state}. Open it with \`/form edit form:${form.key} state:open\` first.`);
    }
    return form;
  }

  async markPanel(guildId: string, formId: string, channelId: string): Promise<void> {
    await this.store.updateForm(guildId, formId, { panelChannelId: channelId });
  }

  async submit(
    guildId: string,
    userId: string,
    reference: string,
    answers: string,
  ): Promise<FormSubmission> {
    this.#requireEnabled("submit a form");
    const form = await this.#resolve(guildId, reference);
    if (form.state !== "open") {
      throw new UserError(`Form \`${form.key}\` is ${form.state} and is not accepting submissions.`);
    }

    const total = await this.store.countSubmissions(guildId, form.id);
    if (total >= this.settings.maxSubmissionsPerForm) {
      throw new UserError(
        `Form \`${form.key}\` has reached its ${this.settings.maxSubmissionsPerForm}-submission cap.`,
      );
    }

    const parsed = parseAnswers(answers, form.fields);
    const result = await this.store.createSubmission({
      guildId,
      formId: form.id,
      userId,
      answers: parsed,
    });
    if (!result.ok) {
      throw new UserError(
        `You already have a pending submission for \`${form.key}\` (\`${result.existing.id}\`). Wait for a decision before applying again.`,
      );
    }
    return result.submission;
  }

  async pending(guildId: string, formReference?: string): Promise<PendingReview[]> {
    const form = formReference ? await this.#resolve(guildId, formReference) : undefined;
    const submissions = await this.store.listSubmissions(guildId, {
      formId: form?.id,
      state: "submitted",
      limit: 10,
    });
    const forms = new Map((await this.store.listForms(guildId, 100)).map((entry) => [entry.id, entry]));
    return submissions.flatMap((submission) => {
      const owned = forms.get(submission.formId);
      return owned ? [{ submission, form: owned }] : [];
    });
  }

  async submissionFor(
    guildId: string,
    submissionId: string,
  ): Promise<{ submission: FormSubmission; form: FormDefinition }> {
    const submission = await this.store.getSubmission(guildId, submissionId);
    if (!submission) throw new UserError(`Submission \`${submissionId}\` was not found in this server.`);
    const form = await this.store.getForm(guildId, submission.formId);
    if (!form) throw new UserError(`The form for submission \`${submissionId}\` no longer exists.`);
    return { submission, form };
  }

  async review(
    guildId: string,
    reviewerId: string,
    submissionId: string,
    state: "accepted" | "denied",
    note?: string,
  ): Promise<FormSubmission> {
    const { submission } = await this.submissionFor(guildId, submissionId);
    if (submission.state !== "submitted") {
      throw new UserError(`Submission \`${submissionId}\` was already ${submission.state}.`);
    }
    const reviewed = await this.store.reviewSubmission(
      guildId,
      submissionId,
      reviewerId,
      state,
      note,
    );
    if (!reviewed) {
      throw new UserError("Another reviewer decided that submission first. It was not changed.");
    }
    return reviewed;
  }

  async export(guildId: string, formReference?: string): Promise<FormExport> {
    const form = formReference ? await this.#resolve(guildId, formReference) : undefined;
    const forms = form ? [form] : await this.store.listForms(guildId, 100);
    const submissions = form
      ? await this.store.listSubmissions(guildId, { formId: form.id, limit: 100 })
      : await this.store.listSubmissions(guildId, { limit: 100 });
    return {
      format: "keystone.forms",
      version: 1,
      guildId,
      generatedAt: new Date(this.now()).toISOString(),
      counts: { forms: forms.length, submissions: submissions.length },
      forms,
      submissions,
    };
  }

  async #resolve(guildId: string, reference: string): Promise<FormDefinition> {
    const form = await this.store.getForm(guildId, reference.trim());
    if (!form) throw new UserError(`Form \`${reference}\` was not found. Use \`/form list\`.`);
    return form;
  }

  #requireEnabled(action: string): void {
    if (!this.settings.enabled) {
      throw new UserError(`Forms are disabled here. Enable them with \`/config set module=forms key=enabled value=true\` to ${action}.`);
    }
  }
}
