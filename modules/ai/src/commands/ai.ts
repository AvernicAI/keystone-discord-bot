import { UserError, defineCommand, type CommandContext, type CommandOption } from "@keystone/kernel";
import type { AiAnswer, AiPort } from "@keystone/kernel";
import { aiSettingsSchema } from "../settings";

function text(ctx: CommandContext, key: string): string | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(ctx: CommandContext, key: string): number | undefined {
  const value = ctx.interaction.options[key];
  return typeof value === "number" ? value : undefined;
}

function requirePermission(ctx: CommandContext, permission: string): void {
  if (!ctx.interaction.permissions.includes(permission)) {
    throw new UserError(`You need the ${permission} permission for that.`);
  }
}

function port(ctx: CommandContext): AiPort {
  if (!ctx.ai) throw new UserError("AI services are not wired.");
  return ctx.ai;
}

async function settingsFor(ctx: CommandContext) {
  if (!ctx.guildId) throw new UserError("This command only works in a server.");
  return aiSettingsSchema.parse(await ctx.settings.get(ctx.guildId));
}

function answerText(answer: AiAnswer): string {
  const sources = answer.sources.length > 0 ? `\n\nSources: ${answer.sources.join(", ")}` : "";
  return `${answer.text.slice(0, 3_500)}${sources}\n\nAI can be wrong. A human decides any action.`;
}

async function replyAnswer(ctx: CommandContext, answer: AiAnswer, title: string): Promise<void> {
  await ctx.interaction.reply({
    embeds: [
      {
        title,
        description: answerText(answer),
        color: 0x5865f2,
        footer: {
          text: `model ${answer.model} · ${answer.usage.inputTokens + answer.usage.outputTokens} tokens · $${answer.usage.costUsd.toFixed(4)}`,
        },
      },
    ],
    ephemeral: true,
  });
}

async function transcriptFor(ctx: CommandContext, ticketId: string): Promise<string> {
  if (!ctx.community) throw new UserError("Community services are not wired.");
  const store = ctx.community.store;
  const ticket = await store.getTicket(ctx.guildId as string, ticketId);
  if (!ticket) throw new UserError("That ticket does not exist.");
  const events = await store.listTicketEvents(ctx.guildId as string, ticketId);
  const messages = await store.listRecords<{ ticketId: string; userId: string; content: string }>(
    ctx.guildId as string,
    "ticket_message",
    100,
  );
  return [
    `Ticket ${ticket.id} · ${ticket.subject}`,
    `Opened by ${ticket.openerId} · state ${ticket.state}`,
    ...events.map((event) => `[${event.createdAt}] ${event.type}`),
    ...messages
      .filter((record) => record.data.ticketId === ticketId)
      .map((record) => `${record.data.userId}: ${record.data.content}`),
  ]
    .join("\n")
    .slice(0, 6_000);
}

const OPTIONS = {
  question: { type: "string", name: "question", description: "Question for the server docs" },
  value: { type: "string", name: "value", description: "Answer, doc content, chat text or budget" },
  name: { type: "string", name: "name", description: "Document name" },
  case: { type: "integer", name: "case", description: "Case number to explain", minValue: 1 },
  ticket: { type: "string", name: "ticket", description: "Ticket id to summarize" },
  limit: { type: "integer", name: "limit", description: "Monthly request limit", minValue: 1 },
} satisfies Record<string, CommandOption>;

function opts(...names: (keyof typeof OPTIONS)[]): CommandOption[] {
  return names.map((name) => OPTIONS[name]);
}

export const ai = defineCommand({
  name: "ai",
  description: "Ask server docs, deflect tickets and explain moderation. Off until enabled.",
  subcommands: [
    { name: "status", description: "Show AI features, usage and retained data." },
    { name: "ask", description: "Answer a question from this server's docs.", options: opts("question") },
    { name: "chat", description: "Ask the model directly in this channel.", options: opts("value") },
    { name: "classify", description: "Label a message as advisory automation evidence.", options: opts("value") },
    { name: "docs-add", description: "Index a server document for answers.", options: opts("name", "value") },
    { name: "docs-list", description: "List indexed server documents." },
    { name: "docs-remove", description: "Remove an indexed server document.", options: opts("name") },
    { name: "deflect", description: "Suggest a reply to a support question.", options: opts("question") },
    { name: "explain", description: "Explain why a moderation case happened.", options: opts("case") },
    { name: "summary", description: "Summarize a ticket thread.", options: opts("ticket") },
    { name: "budget", description: "Set the monthly AI budget and request cap.", options: opts("value", "limit") },
  ],
  guards: [
    (ctx: CommandContext) =>
      ctx.guildId
        ? { ok: true }
        : { ok: false, message: "This command only works in a server." },
  ],
  async execute(ctx: CommandContext): Promise<void> {
    const service = port(ctx);
    const selected = ctx.commandPath[0] ?? text(ctx, "action");
    const guildId = ctx.guildId as string;
    const settings = await settingsFor(ctx);

    if (selected === "status") {
      const status = await service.status(guildId);
      await ctx.interaction.reply({
        embeds: [
          {
            title: "AI status",
            description: [
              `Module: **${status.enabled ? "enabled" : "off"}** · provider: **${status.provider}**${status.configured ? "" : " (not configured)"}`,
              `Features: chat ${status.features.chat ? "on" : "off"} · deflection ${status.features.deflection ? "on" : "off"} · explanations ${status.features.explanations ? "on" : "off"} · summaries ${status.features.summaries ? "on" : "off"}`,
              `Classification: ${status.features.classification ? "on" : "off"} (advisory only)`,
              `This month: **${status.usage.requests}** requests · **$${status.usage.costUsd.toFixed(4)}** of **$${status.monthlyBudgetUsd.toFixed(2)}** · docs **${status.documents}**`,
              "Retention: **none** — prompts and completions are not stored.",
            ].join("\n"),
            color: 0x5865f2,
          },
        ],
        ephemeral: true,
      });
      return;
    }

    if (selected === "budget") {
      requirePermission(ctx, "ManageGuild");
      const raw = text(ctx, "value");
      const amount = raw ? Number(raw) : Number.NaN;
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000) {
        throw new UserError("Set a monthly budget between 0 and 1000 USD in `value`.");
      }
      await ctx.settings.update(guildId, {
        ...settings,
        monthlyBudgetUsd: amount,
        monthlyRequests: integer(ctx, "limit") ?? settings.monthlyRequests,
      });
      await ctx.interaction.reply({
        content: `AI budget set to $${amount.toFixed(2)} and ${integer(ctx, "limit") ?? settings.monthlyRequests} requests per month.`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "docs-add") {
      requirePermission(ctx, "ManageGuild");
      const name = text(ctx, "name");
      const content = text(ctx, "value");
      if (!name || !content) throw new UserError("A document needs a name and content.");
      const document = await service.addDocument(guildId, name, content);
      await ctx.interaction.reply({
        content: `Document **${document.name}** saved as ${document.id} (${document.chunks} chunks).`,
        ephemeral: true,
      });
      return;
    }

    if (selected === "docs-list") {
      requirePermission(ctx, "ManageGuild");
      const documents = await service.listDocuments(guildId);
      await ctx.interaction.reply({
        content:
          documents.length === 0
            ? "No server documents are indexed."
            : documents
                .map((document) => `• **${document.name}** — \`${document.id}\` (${document.chunks} chunks)`)
                .join("\n")
                .slice(0, 1_900),
        ephemeral: true,
      });
      return;
    }

    if (selected === "docs-remove") {
      requirePermission(ctx, "ManageGuild");
      const id = text(ctx, "name");
      if (!id) throw new UserError("Pass the document id as `name`.");
      const removed = await service.removeDocument(guildId, id);
      await ctx.interaction.reply({
        content: removed ? "Document removed." : "No document with that id in this server.",
        ephemeral: true,
      });
      return;
    }

    if (selected === "ask") {
      const question = text(ctx, "question") ?? text(ctx, "value");
      if (!question) throw new UserError("Ask a question with `question`.");
      await replyAnswer(ctx, await service.ask(guildId, question), "Server answer");
      return;
    }

    if (selected === "chat") {
      const message = text(ctx, "value") ?? text(ctx, "question");
      if (!message) throw new UserError("Write a message with `value`.");
      await replyAnswer(ctx, await service.chat(guildId, ctx.userId, message), "AI chat");
      return;
    }

    if (selected === "classify") {
      requirePermission(ctx, "ManageMessages");
      const value = text(ctx, "value") ?? text(ctx, "question");
      if (!value) throw new UserError("Pass the message text in `value`.");
      await replyAnswer(ctx, await service.classify(guildId, value), "Advisory classification");
      return;
    }

    if (selected === "deflect") {
      requirePermission(ctx, "ManageMessages");
      const question = text(ctx, "question") ?? text(ctx, "value");
      if (!question) throw new UserError("Pass the ticket question with `question`.");
      await replyAnswer(ctx, await service.deflect(guildId, question), "Suggested reply");
      return;
    }

    if (selected === "explain") {
      requirePermission(ctx, "ManageGuild");
      const caseNumber = integer(ctx, "case");
      if (!caseNumber) throw new UserError("Pass a case number with `case`.");
      if (!ctx.moderation) throw new UserError("Moderation services are not wired.");
      const record = await ctx.moderation.cases.get(guildId, caseNumber);
      if (!record) throw new UserError("That case does not exist.");
      const facts = [
        `Case #${record.caseNumber}`,
        `Action: ${record.action}`,
        `Rule: ${record.rule ?? "none recorded"}`,
        `State: ${record.state}`,
        `Reason: ${record.reason}`,
        `Target: ${record.targetId}`,
        `Actor: ${record.actorId}`,
      ].join("\n");
      await replyAnswer(ctx, await service.explain(guildId, facts), `Case #${record.caseNumber} explanation`);
      return;
    }

    if (selected === "summary") {
      requirePermission(ctx, "ManageGuild");
      const ticketId = text(ctx, "ticket");
      if (!ticketId) throw new UserError("Pass a ticket id with `ticket`.");
      await replyAnswer(ctx, await service.summarize(guildId, await transcriptFor(ctx, ticketId)), "Ticket summary");
    }
  },
  notes:
    "AI recommends and explains; it never takes a moderation action. Caps are checked before the provider call and usage keeps only counters.",
});
