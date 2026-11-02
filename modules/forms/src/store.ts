import { randomUUID } from "node:crypto";
import type {
  FormCreateResult,
  FormDefinition,
  FormPatch,
  FormState,
  FormStore,
  FormSubmission,
  FormSubmissionFilter,
  FormSubmissionState,
  FormSubmitResult,
  NewForm,
  NewFormSubmission,
} from "@keystone/kernel";

const nowIso = (): string => new Date().toISOString();

/**
 * In-memory form store.
 *
 * It is a real store, not a mock: keys are unique per guild, a member cannot
 * open two pending submissions for the same form, and only a `submitted` row
 * can be reviewed. Tests use it; a deployment swaps the Postgres adapter
 * behind the same port.
 */
export class InMemoryFormStore implements FormStore {
  readonly #forms = new Map<string, FormDefinition>();
  readonly #submissions = new Map<string, FormSubmission>();

  async createForm(input: NewForm): Promise<FormCreateResult> {
    const duplicate = [...this.#forms.values()].find(
      (form) => form.guildId === input.guildId && form.key === input.key,
    );
    if (duplicate) return { ok: false, reason: "duplicate-key" };

    const at = nowIso();
    const form: FormDefinition = {
      id: randomUUID(),
      guildId: input.guildId,
      key: input.key,
      name: input.name,
      description: input.description,
      fields: input.fields.map((field) => ({ ...field })),
      state: input.state,
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
    };
    this.#forms.set(form.id, form);
    return { ok: true, form };
  }

  async getForm(guildId: string, reference: string): Promise<FormDefinition | undefined> {
    const forms = [...this.#forms.values()].filter((form) => form.guildId === guildId);
    return forms.find((form) => form.key === reference) ?? forms.find((form) => form.id === reference);
  }

  async listForms(guildId: string, limit = 50): Promise<FormDefinition[]> {
    return [...this.#forms.values()]
      .filter((form) => form.guildId === guildId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.key.localeCompare(b.key))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async updateForm(
    guildId: string,
    formId: string,
    patch: FormPatch,
  ): Promise<FormDefinition | undefined> {
    const current = this.#forms.get(formId);
    if (!current || current.guildId !== guildId) return undefined;

    const updated: FormDefinition = {
      ...current,
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      fields: patch.fields
        ? patch.fields.map((field) => ({ ...field }))
        : current.fields,
      state: patch.state ?? current.state,
      panelChannelId: patch.panelChannelId ?? current.panelChannelId,
      updatedAt: nowIso(),
    };
    this.#forms.set(formId, updated);
    return updated;
  }

  async deleteForm(guildId: string, formId: string): Promise<boolean> {
    const current = this.#forms.get(formId);
    if (!current || current.guildId !== guildId) return false;
    for (const [id, submission] of this.#submissions) {
      if (submission.formId === formId) this.#submissions.delete(id);
    }
    this.#forms.delete(formId);
    return true;
  }

  async countSubmissions(guildId: string, formId?: string): Promise<number> {
    return [...this.#submissions.values()].filter(
      (submission) =>
        submission.guildId === guildId && (!formId || submission.formId === formId),
    ).length;
  }

  async createSubmission(input: NewFormSubmission): Promise<FormSubmitResult> {
    const existing = [...this.#submissions.values()].find(
      (submission) =>
        submission.guildId === input.guildId &&
        submission.formId === input.formId &&
        submission.userId === input.userId &&
        submission.state === "submitted",
    );
    if (existing) return { ok: false, existing };

    const at = nowIso();
    const submission: FormSubmission = {
      id: randomUUID(),
      guildId: input.guildId,
      formId: input.formId,
      userId: input.userId,
      answers: { ...input.answers },
      state: "submitted",
      createdAt: at,
      updatedAt: at,
    };
    this.#submissions.set(submission.id, submission);
    return { ok: true, submission };
  }

  async getSubmission(
    guildId: string,
    submissionId: string,
  ): Promise<FormSubmission | undefined> {
    const submission = this.#submissions.get(submissionId);
    return submission?.guildId === guildId ? submission : undefined;
  }

  async listSubmissions(
    guildId: string,
    filter: FormSubmissionFilter = {},
  ): Promise<FormSubmission[]> {
    return [...this.#submissions.values()]
      .filter((submission) => submission.guildId === guildId)
      .filter((submission) => !filter.formId || submission.formId === filter.formId)
      .filter((submission) => !filter.userId || submission.userId === filter.userId)
      .filter((submission) => !filter.state || submission.state === filter.state)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(filter.limit ?? 50, 1), 100));
  }

  async reviewSubmission(
    guildId: string,
    submissionId: string,
    reviewerId: string,
    state: "accepted" | "denied",
    note?: string,
  ): Promise<FormSubmission | undefined> {
    const current = this.#submissions.get(submissionId);
    if (!current || current.guildId !== guildId || current.state !== "submitted") {
      return undefined;
    }
    const updated: FormSubmission = {
      ...current,
      state,
      reviewedBy: reviewerId,
      decisionNote: note?.trim() || undefined,
      updatedAt: nowIso(),
    };
    this.#submissions.set(submissionId, updated);
    return updated;
  }

}

export type { FormState, FormSubmissionState };
