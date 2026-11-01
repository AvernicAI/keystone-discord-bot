import { z } from "zod";

/**
 * AI is off by default. Enabling the module does not enable every feature: an
 * admin can turn on server answers without enabling mention chat or ticket
 * deflection. The retention field is deliberately a literal, not a toggle.
 */
export const aiSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  chat: z.boolean().default(false),
  classification: z.boolean().default(false),
  deflection: z.boolean().default(false),
  explanations: z.boolean().default(false),
  summaries: z.boolean().default(false),
  /** Hard monthly ceiling, checked server-side before every provider call. */
  monthlyBudgetUsd: z.number().min(0).max(1_000).default(1),
  monthlyRequests: z.number().int().min(1).max(100_000).default(250),
  maxOutputTokens: z.number().int().min(32).max(2_000).default(300),
  contextChunks: z.number().int().min(1).max(5).default(3),
  maxDocumentChars: z.number().int().min(500).max(8_000).default(6_000),
  chunkChars: z.number().int().min(200).max(2_000).default(1_200),
  temperature: z.number().min(0).max(1).default(0.2),
  /** There is no config path to store prompts or completions. */
  retention: z.literal("none").default("none"),
});

export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const aiDefaultSettings = aiSettingsSchema.parse({});
