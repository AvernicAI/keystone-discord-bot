/**
 * Forms and applications, structurally.
 *
 * A form is configuration an operator owns; a submission is state a member
 * creates and a reviewer changes. They are deliberately separate records with
 * one store: the review queue must not have to parse a JSON blob in settings to
 * find an answer, and a settings write must not be able to rewrite history.
 */

export type FormState = "draft" | "open" | "closed";
export type FormSubmissionState = "submitted" | "accepted" | "denied";

export interface FormFieldDefinition {
  /** Stable answer key, unique inside the form. */
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly maxLength: number;
}

export interface FormDefinition {
  readonly id: string;
  readonly guildId: string;
  /** Short operator-facing reference used by every subcommand. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly fields: readonly FormFieldDefinition[];
  readonly state: FormState;
  /** Where `/form panel` most recently posted the public panel. */
  readonly panelChannelId?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewForm {
  readonly guildId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly fields: readonly FormFieldDefinition[];
  readonly state: FormState;
  readonly createdBy: string;
}

export type FormCreateResult =
  | { readonly ok: true; readonly form: FormDefinition }
  | { readonly ok: false; readonly reason: "duplicate-key" };

export interface FormPatch {
  readonly name?: string;
  readonly description?: string;
  readonly fields?: readonly FormFieldDefinition[];
  readonly state?: FormState;
  readonly panelChannelId?: string;
}

export interface FormSubmission {
  readonly id: string;
  readonly guildId: string;
  readonly formId: string;
  readonly userId: string;
  readonly answers: Readonly<Record<string, string>>;
  readonly state: FormSubmissionState;
  readonly reviewedBy?: string;
  readonly decisionNote?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewFormSubmission {
  readonly guildId: string;
  readonly formId: string;
  readonly userId: string;
  readonly answers: Readonly<Record<string, string>>;
}

export type FormSubmitResult =
  | { readonly ok: true; readonly submission: FormSubmission }
  | { readonly ok: false; readonly existing: FormSubmission };

export interface FormSubmissionFilter {
  readonly formId?: string;
  readonly userId?: string;
  readonly state?: FormSubmissionState;
  readonly limit?: number;
}

/**
 * The one owner of form state. In-memory and Postgres implement the same
 * transitions; commands never branch on which adapter is live.
 */
export interface FormStore {
  createForm(input: NewForm): Promise<FormCreateResult>;
  /** Resolve by key or id, always scoped to the guild. */
  getForm(guildId: string, reference: string): Promise<FormDefinition | undefined>;
  listForms(guildId: string, limit?: number): Promise<FormDefinition[]>;
  updateForm(
    guildId: string,
    formId: string,
    patch: FormPatch,
  ): Promise<FormDefinition | undefined>;
  /** Deletes the form; callers refuse when submissions exist. */
  deleteForm(guildId: string, formId: string): Promise<boolean>;
  countSubmissions(guildId: string, formId?: string): Promise<number>;
  createSubmission(input: NewFormSubmission): Promise<FormSubmitResult>;
  getSubmission(guildId: string, submissionId: string): Promise<FormSubmission | undefined>;
  listSubmissions(
    guildId: string,
    filter?: FormSubmissionFilter,
  ): Promise<FormSubmission[]>;
  /** Only a `submitted` row can transition; a decided row returns undefined. */
  reviewSubmission(
    guildId: string,
    submissionId: string,
    reviewerId: string,
    state: "accepted" | "denied",
    note?: string,
  ): Promise<FormSubmission | undefined>;
}
