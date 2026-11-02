import { z } from "zod";

/**
 * Modmail is enabled by default; there is no channel to configure because the
 * conversation lives in rows and is read through the command, not a gateway
 * thread. The caps keep one guild from turning the table into an unbounded log.
 */
export const modmailSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxThreads: z.number().int().min(1).max(2_000).default(500),
  maxMessagesPerThread: z.number().int().min(10).max(1_000).default(200),
  maxMessageLength: z.number().int().min(200).max(4_000).default(2_000),
});

export type ModmailSettings = z.infer<typeof modmailSettingsSchema>;

export const modmailDefaultSettings = modmailSettingsSchema.parse({});
