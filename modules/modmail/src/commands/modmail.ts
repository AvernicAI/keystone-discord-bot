import {
  UserError,
  cooldown,
  defineCommand,
  requireGuild,
  type CommandContext,
  type CommandOption,
  type ModmailMessage,
  type ModmailStats,
  type ModmailThread,
} from "@keystone/kernel";
import {
  ModmailService,
  type ModmailActor,
  type ModmailTranscriptView,
} from "../modmail";
import { modmailSettingsSchema } from "../settings";

const OPTIONS = {
  subject: {
    type: "string",
    name: "subject",
    description: "What the thread is about",
    required: true,
  },
  message: {
    type: "string",
    name: "message",
    description: "Your message",
    required: true,
  },
  thread: {
    type: "string",
    name: "thread",
    description: "Thread id shown by /modmail open",
    required: true,
  },
  resolution: {
    type: "string",
    name: "resolution",
    description: "Optional closing note stored with the archived transcript",
  },
  enabled: {
    type: "boolean",
    name: "enabled",
    description: "Turn private member mail on or off in this server",
  },
  maxThreads: {
    type: "integer",
    name: "max_threads",
    description: "Maximum stored threads for this server",
    minValue: 1,
    maxValue: 2_000,
  },
} satisfies Record<string, CommandOption>;

function text(ctx: CommandContext, key: keyof typeof OPTIONS): string | undefined {
  const value = ctx.interaction.options[OPTIONS[key].name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isStaff(ctx: CommandContext): boolean {
  const held = ctx.interaction.permissions;
  return (
    held.includes("ManageGuild") ||
    held.includes("ManageMessages") ||
    held.includes("ModerateMembers") ||
    held.includes("Administrator")
  );
}

function requireManage(ctx: CommandContext): void {
  const held = ctx.interaction.permissions;
  if (!held.includes("ManageGuild") && !held.includes("Administrator")) {
    throw new UserError("Missing permission: ManageGuild");
  }
}

function requireStaff(ctx: CommandContext): void {
  if (!isStaff(ctx)) throw new UserError("Missing permission: ManageMessages");
}

function actor(ctx: CommandContext): ModmailActor {
  return { id: ctx.userId, staff: isStaff(ctx) };
}

function store(ctx: CommandContext) {
  const modmail = ctx.modmail;
  if (!modmail) throw new UserError("Modmail is not wired in this process.");
  return modmail;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function seconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1_000);
}

function stateLine(thread: ModmailThread): string {
  return [
    `\`${thread.id}\``,
    `**${thread.subject}**`,
    thread.state,
    `<@${thread.ownerId}>`,
    `${thread.messageCount} message${thread.messageCount === 1 ? "" : "s"}`,
    thread.staffUnread > 0 ? `${thread.staffUnread} staff unread` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function messageLine(message: ModmailMessage): string {
  return `**${message.side}** · <@${message.authorId}> · <t:${seconds(message.createdAt)}:R>\n${clip(message.body, 500)}`;
}

function transcriptText(view: ModmailTranscriptView): string {
  return view.messages.map(messageLine).join("\n\n");
}

function transcriptPayload(
  guildId: string,
  view: ModmailTranscriptView,
  now: number,
): Record<string, unknown> {
  return {
    format: "keystone.modmail",
    version: 1,
    guildId,
    generatedAt: new Date(now).toISOString(),
    thread: {
      id: view.thread.id,
      ownerId: view.thread.ownerId,
      subject: view.thread.subject,
      state: view.thread.state,
      createdAt: view.thread.createdAt,
      claimedBy: view.thread.claimedBy,
      closedBy: view.thread.closedBy,
    },
    messages: view.messages,
    counts: { messages: view.messages.length },
  };
}

function statsFields(stats: ModmailStats) {
  return [
    { name: "Threads", value: String(stats.total), inline: true },
    { name: "Open", value: String(stats.open), inline: true },
    { name: "Claimed", value: String(stats.claimed), inline: true },
    { name: "Closed", value: String(stats.closed), inline: true },
    { name: "Messages", value: String(stats.messages), inline: true },
    { name: "Staff unread", value: String(stats.staffUnread), inline: true },
  ];
}

export const modmail = defineCommand({
  name: "modmail",
  description: "Private member-to-staff mail: open a thread, reply, close and read transcripts.",
  subcommands: [
    {
      name: "setup",
      description: "Show or change the modmail switches for this server.",
      options: [OPTIONS.enabled, OPTIONS.maxThreads],
    },
    {
      name: "open",
      description: "Open a private thread; only you and staff can read it.",
      options: [OPTIONS.subject, OPTIONS.message],
    },
    {
      name: "reply",
      description: "Add a message to your thread, or answer as staff.",
      options: [OPTIONS.thread, OPTIONS.message],
    },
    {
      name: "close",
      description: "Close a thread and archive its transcript exactly once.",
      options: [OPTIONS.thread, OPTIONS.resolution],
    },
    {
      name: "transcript",
      description: "Read a thread you own, or any thread as staff.",
      options: [OPTIONS.thread],
    },
    {
      name: "stats",
      description: "Staff queue counts read from the modmail tables.",
    },
  ],
  guards: [requireGuild, cooldown(3_000)],
  async execute(ctx: CommandContext): Promise<void> {
    const settings = modmailSettingsSchema.parse(await ctx.settings.get(ctx.guildId as string));
    const guildId = ctx.guildId as string;
    const storePort = store(ctx);
    const service = new ModmailService(storePort, settings, ctx.now);
    const selected = ctx.commandPath[0];

    if (selected === "setup") {
      requireManage(ctx);
      const enabled = ctx.interaction.options.enabled;
      const maxThreads = ctx.interaction.options.max_threads;
      const patch: Record<string, unknown> = {};
      if (typeof enabled === "boolean") patch.enabled = enabled;
      if (typeof maxThreads === "number") patch.maxThreads = maxThreads;
      const updated =
        Object.keys(patch).length > 0
          ? modmailSettingsSchema.parse(await ctx.settings.update(guildId, patch))
          : settings;
      const stats = await service.stats(guildId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Modmail setup · ${updated.enabled ? "enabled" : "disabled"} · max ${updated.maxThreads} threads · ${stats.open + stats.claimed} active`,
        embeds: [
          {
            title: "Modmail setup",
            description:
              Object.keys(patch).length > 0
                ? "The module schema accepted the change and stored the validated settings."
                : "Effective settings for this server. Pass `enabled` or `max_threads` to change them.",
            color: 0x5865f2,
            fields: [
              { name: "Enabled", value: String(updated.enabled), inline: true },
              { name: "Max threads", value: String(updated.maxThreads), inline: true },
              {
                name: "Message cap",
                value: `${updated.maxMessagesPerThread} per thread`,
                inline: true,
              },
              { name: "Threads", value: String(stats.total), inline: true },
              { name: "Messages", value: String(stats.messages), inline: true },
              { name: "Staff unread", value: String(stats.staffUnread), inline: true },
            ],
            footer: { text: "Settings live in the shared per-guild module settings record." },
          },
        ],
      });
      return;
    }

    if (selected === "open") {
      const opened = await service.open(guildId, actor(ctx), {
        subject: text(ctx, "subject") ?? "",
        message: text(ctx, "message") ?? "",
      });
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Mail thread \`${opened.id}\` opened · ${opened.state} · only you and staff can read it.`,
        embeds: [
          {
            title: opened.subject,
            description:
              "Reply with `/modmail reply`; read the conversation with `/modmail transcript`. Closing archives it once.",
            color: 0x5865f2,
            fields: [
              { name: "Thread", value: `\`${opened.id}\``, inline: false },
              { name: "Owner", value: `<@${opened.ownerId}>`, inline: true },
              { name: "State", value: opened.state, inline: true },
              { name: "Messages", value: String(opened.messageCount), inline: true },
            ],
            footer: { text: "Private by row: another member is refused by the same message as a missing thread." },
          },
        ],
      });
      return;
    }

    if (selected === "reply") {
      const threadId = text(ctx, "thread");
      if (!threadId) throw new UserError("Choose a thread with the `thread` option.");
      const outcome = await service.reply(
        guildId,
        actor(ctx),
        threadId,
        text(ctx, "message") ?? "",
      );
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Reply recorded on \`${outcome.thread.id}\` · ${outcome.message.side} side · ${outcome.thread.state} · ${outcome.thread.messageCount} message${outcome.thread.messageCount === 1 ? "" : "s"}.`,
      });
      return;
    }

    if (selected === "close") {
      const threadId = text(ctx, "thread");
      if (!threadId) throw new UserError("Choose a thread with the `thread` option.");
      const closed = await service.close(
        guildId,
        actor(ctx),
        threadId,
        text(ctx, "resolution"),
      );
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Thread \`${closed.thread.id}\` closed · ${closed.transcript.counts.messages} messages archived · checksum \`${closed.checksum.slice(0, 16)}…\``,
        embeds: [
          {
            title: `Closed: ${closed.thread.subject}`,
            description:
              "The canonical transcript and its SHA-256 checksum were stored in the same conditional update. A second close refuses and writes nothing.",
            color: 0x57f287,
            fields: [
              { name: "Owner", value: `<@${closed.thread.ownerId}>`, inline: true },
              { name: "Closed by", value: `<@${closed.thread.closedBy}>`, inline: true },
              {
                name: "Archived",
                value: `${closed.transcript.counts.messages} messages`,
                inline: true,
              },
              {
                name: "Checksum",
                value: `\`${closed.checksum}\``,
                inline: false,
              },
            ],
            footer: { text: "Read it with /modmail transcript; the archived JSON is the durable copy." },
          },
        ],
      });
      return;
    }

    if (selected === "transcript") {
      const threadId = text(ctx, "thread");
      if (!threadId) throw new UserError("Choose a thread with the `thread` option.");
      const view = await service.transcript(guildId, actor(ctx), threadId);
      const textBody = transcriptText(view);
      const tooLong = textBody.length > 3_800;
      const payload = transcriptPayload(guildId, view, ctx.now());
      const content = tooLong
        ? { ...payload, ...(view.checksum ? { checksum: view.checksum } : {}) }
        : undefined;

      await ctx.interaction.reply({
        ephemeral: true,
        content: `Transcript \`${view.thread.id}\` · ${view.messages.length} message${view.messages.length === 1 ? "" : "s"} · ${view.archived ? "archived" : "live, not archived yet"}`,
        embeds: [
          {
            title: view.thread.subject,
            description: tooLong
              ? `${view.messages.length} messages are attached as JSON; the embed would truncate them.`
              : textBody || "No messages.",
            color: view.archived ? 0x57f287 : 0x5865f2,
            fields: [
              { name: "State", value: view.thread.state, inline: true },
              { name: "Owner", value: `<@${view.thread.ownerId}>`, inline: true },
              ...(view.archived && view.checksum
                ? [{ name: "Checksum", value: `\`${view.checksum}\``, inline: false }]
                : []),
            ],
            footer: {
              text: view.archived
                ? "This is the stored archive, not a re-render of editable rows."
                : "Reading clears your unread counter; closing stores this transcript once.",
            },
          },
        ],
        files: content
          ? [
              {
                name: `keystone.modmail.${view.thread.id}.json`,
                content: JSON.stringify(content, null, 2),
                description: "Private mail transcript. Contains member ids; keep it private.",
              },
            ]
          : undefined,
      });
      return;
    }

    if (selected === "stats") {
      requireStaff(ctx);
      const stats = await service.stats(guildId);
      const active = await service.active(guildId);
      await ctx.interaction.reply({
        ephemeral: true,
        content: `Modmail stats · ${stats.total} threads · ${stats.open + stats.claimed} active · ${stats.messages} messages`,
        embeds: [
          {
            title: "Modmail queue",
            description:
              active.length > 0
                ? active.map(stateLine).join("\n")
                : "No active threads. Counts read from `modmail_threads` and `modmail_messages`.",
            color: 0x5865f2,
            fields: statsFields(stats),
            footer: {
              text: "Active thread ids are listed so staff can reply; counts have no cached counter.",
            },
          },
        ],
      });
      return;
    }

    throw new UserError("Unknown modmail action. Use `/modmail setup`.");
  },
  help: {
    category: "Community",
    examples: [
      "/modmail open subject:Broken role message:My role disappeared",
      "/modmail reply thread:<id> message:Thanks, looking now",
      "/modmail transcript thread:<id>",
      "/modmail close thread:<id> resolution:Fixed the role",
      "/modmail stats",
    ],
    permissions: ["ManageGuild", "ManageMessages"],
  },
  notes:
    "A thread belongs to the member who opened it. Only that member and staff can read or reply; a foreign thread and a missing thread produce the same refusal. The first staff reply claims an open thread. Closing archives the canonical transcript, its SHA-256 checksum and its message count in one conditional update, so a duplicate close cannot write a second archive.",
});
