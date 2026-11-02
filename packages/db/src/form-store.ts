import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  FormCreateResult,
  FormDefinition,
  FormFieldDefinition,
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
import { formSubmissions, forms } from "./schema";
import type { schema } from "./schema";

type FormRow = typeof forms.$inferSelect;
type SubmissionRow = typeof formSubmissions.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toForm(row: FormRow): FormDefinition {
  return {
    id: row.id,
    guildId: row.guildId,
    key: row.key,
    name: row.name,
    description: row.description,
    fields: (row.fields as FormFieldDefinition[]) ?? [],
    state: row.state as FormState,
    panelChannelId: row.panelChannelId ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: row.id,
    guildId: row.guildId,
    formId: row.formId,
    userId: row.userId,
    answers: (row.answers as Record<string, string>) ?? {},
    state: row.state as FormSubmissionState,
    reviewedBy: row.reviewedBy ?? undefined,
    decisionNote: row.decisionNote ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Postgres adapter for forms. The partial unique index is the real guard for
 * one pending submission per member; this class also reads the existing row
 * back so the command can name it instead of reporting a generic conflict.
 */
export class DrizzleFormStore implements FormStore {
  constructor(private readonly db: PgDatabase<any, typeof schema>) {}

  async createForm(input: NewForm): Promise<FormCreateResult> {
    const [row] = await this.db
      .insert(forms)
      .values({
        guildId: input.guildId,
        key: input.key,
        name: input.name,
        description: input.description,
        fields: [...input.fields],
        state: input.state,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({ target: [forms.guildId, forms.key] })
      .returning();
    if (!row) return { ok: false, reason: "duplicate-key" };
    return { ok: true, form: toForm(row) };
  }

  async getForm(guildId: string, reference: string): Promise<FormDefinition | undefined> {
    const [byKey] = await this.db
      .select()
      .from(forms)
      .where(and(eq(forms.guildId, guildId), eq(forms.key, reference)))
      .limit(1);
    if (byKey) return toForm(byKey);
    if (!UUID.test(reference)) return undefined;

    const [byId] = await this.db
      .select()
      .from(forms)
      .where(and(eq(forms.guildId, guildId), eq(forms.id, reference)))
      .limit(1);
    return byId ? toForm(byId) : undefined;
  }

  async listForms(guildId: string, limit = 50): Promise<FormDefinition[]> {
    const rows = await this.db
      .select()
      .from(forms)
      .where(eq(forms.guildId, guildId))
      .orderBy(desc(forms.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toForm);
  }

  async updateForm(
    guildId: string,
    formId: string,
    patch: FormPatch,
  ): Promise<FormDefinition | undefined> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.fields !== undefined) values.fields = [...patch.fields];
    if (patch.state !== undefined) values.state = patch.state;
    if (patch.panelChannelId !== undefined) values.panelChannelId = patch.panelChannelId;

    const [row] = await this.db
      .update(forms)
      .set(values)
      .where(and(eq(forms.guildId, guildId), eq(forms.id, formId)))
      .returning();
    return row ? toForm(row) : undefined;
  }

  async deleteForm(guildId: string, formId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(forms)
      .where(and(eq(forms.guildId, guildId), eq(forms.id, formId)))
      .returning({ id: forms.id });
    return deleted.length > 0;
  }

  async countSubmissions(guildId: string, formId?: string): Promise<number> {
    const conditions = [eq(formSubmissions.guildId, guildId)];
    if (formId) conditions.push(eq(formSubmissions.formId, formId));
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(...conditions));
    return Number(row?.count ?? 0);
  }

  async createSubmission(input: NewFormSubmission): Promise<FormSubmitResult> {
    const [row] = await this.db
      .insert(formSubmissions)
      .values({
        guildId: input.guildId,
        formId: input.formId,
        userId: input.userId,
        answers: { ...input.answers },
        state: "submitted",
      })
      .onConflictDoNothing()
      .returning();
    if (row) return { ok: true, submission: toSubmission(row) };

    const [existing] = await this.db
      .select()
      .from(formSubmissions)
      .where(
        and(
          eq(formSubmissions.guildId, input.guildId),
          eq(formSubmissions.formId, input.formId),
          eq(formSubmissions.userId, input.userId),
          eq(formSubmissions.state, "submitted"),
        ),
      )
      .orderBy(desc(formSubmissions.createdAt))
      .limit(1);
    if (!existing) throw new Error("Could not record the submission");
    return { ok: false, existing: toSubmission(existing) };
  }

  async getSubmission(
    guildId: string,
    submissionId: string,
  ): Promise<FormSubmission | undefined> {
    if (!UUID.test(submissionId)) return undefined;
    const [row] = await this.db
      .select()
      .from(formSubmissions)
      .where(
        and(eq(formSubmissions.guildId, guildId), eq(formSubmissions.id, submissionId)),
      )
      .limit(1);
    return row ? toSubmission(row) : undefined;
  }

  async listSubmissions(
    guildId: string,
    filter: FormSubmissionFilter = {},
  ): Promise<FormSubmission[]> {
    const conditions = [eq(formSubmissions.guildId, guildId)];
    if (filter.formId) conditions.push(eq(formSubmissions.formId, filter.formId));
    if (filter.userId) conditions.push(eq(formSubmissions.userId, filter.userId));
    if (filter.state) conditions.push(eq(formSubmissions.state, filter.state));
    const rows = await this.db
      .select()
      .from(formSubmissions)
      .where(and(...conditions))
      .orderBy(desc(formSubmissions.createdAt))
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));
    return rows.map(toSubmission);
  }

  async reviewSubmission(
    guildId: string,
    submissionId: string,
    reviewerId: string,
    state: "accepted" | "denied",
    note?: string,
  ): Promise<FormSubmission | undefined> {
    if (!UUID.test(submissionId)) return undefined;
    const [row] = await this.db
      .update(formSubmissions)
      .set({
        state,
        reviewedBy: reviewerId,
        decisionNote: note?.trim() ? note.trim() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(formSubmissions.guildId, guildId),
          eq(formSubmissions.id, submissionId),
          eq(formSubmissions.state, "submitted"),
        ),
      )
      .returning();
    return row ? toSubmission(row) : undefined;
  }
}
