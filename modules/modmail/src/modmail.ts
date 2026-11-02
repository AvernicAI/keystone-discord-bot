import { createHash } from "node:crypto";
import { UserError } from "@keystone/kernel";
import type {
  ModmailMessage,
  ModmailSide,
  ModmailStats,
  ModmailStore,
  ModmailThread,
  ModmailTranscript,
} from "@keystone/kernel";
import type { ModmailSettings } from "./settings";

export interface ModmailActor {
  readonly id: string;
  readonly staff: boolean;
}

export interface ModmailOpenInput {
  readonly subject: string;
  readonly message: string;
}

export interface ModmailReplyOutcome {
  readonly thread: ModmailThread;
  readonly message: ModmailMessage;
}

export interface ModmailCloseOutcome {
  readonly thread: ModmailThread;
  readonly transcript: ModmailTranscript;
  readonly checksum: string;
}

export interface ModmailTranscriptView {
  readonly thread: ModmailThread;
  readonly messages: readonly ModmailMessage[];
  readonly archived: boolean;
  readonly checksum?: string;
}

/**
 * The state machine behind `/modmail`.
 *
 * A thread belongs to the member who opened it. Only that member and staff may
 * read or write it, and the refusal for anyone else deliberately looks the same
 * as a missing thread, so the command cannot be used to discover other members'
 * mail. Closing archives the conversation exactly once; a second close is a
 * refusal, not a second transcript.
 *
 * Ownership wins over staff status: if a moderator opens a thread, their own
 * replies are member messages. That keeps "which side spoke" unambiguous.
 */
export class ModmailService {
  constructor(
    private readonly store: ModmailStore,
    private readonly settings: ModmailSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async open(
    guildId: string,
    actor: ModmailActor,
    input: ModmailOpenInput,
  ): Promise<ModmailThread> {
    this.#requireEnabled("open a mail thread");
    const subject = input.subject.trim();
    if (!subject) throw new UserError("Give the thread a subject.");
    if (subject.length > 120) {
      throw new UserError("The subject must be 120 characters or fewer.");
    }
    const body = this.#body(input.message);

    const active = await this.store.getActiveThread(guildId, actor.id);
    if (active) {
      throw new UserError(
        `You already have an active thread \`${active.id}\`. Reply to it with \`/modmail reply thread:${active.id} message:<text>\` or close it first.`,
      );
    }

    const stats = await this.store.stats(guildId);
    if (stats.total >= this.settings.maxThreads) {
      throw new UserError(
        `This server already has ${this.settings.maxThreads} mail threads. Close an old one before opening another.`,
      );
    }

    const created = await this.store.createThread({
      guildId,
      ownerId: actor.id,
      subject,
      body,
      authorId: actor.id,
    });
    if (!created.ok) {
      throw new UserError(
        `You already have an active thread \`${created.thread.id}\`. Reply to it with \`/modmail reply thread:${created.thread.id} message:<text>\` or close it first.`,
      );
    }
    return created.thread;
  }

  async reply(
    guildId: string,
    actor: ModmailActor,
    threadId: string,
    body: string,
  ): Promise<ModmailReplyOutcome> {
    const thread = await this.#visible(guildId, actor, threadId);
    if (thread.ownerId === actor.id) this.#requireEnabled("reply to your mail");
    if (thread.state === "closed") {
      throw new UserError(
        `Thread \`${thread.id}\` is closed. Open a new thread with \`/modmail open\`.`,
      );
    }
    if (thread.messageCount >= this.settings.maxMessagesPerThread) {
      throw new UserError(
        `Thread \`${thread.id}\` has reached ${this.settings.maxMessagesPerThread} messages. Close it and open a new one.`,
      );
    }

    const side: ModmailSide = thread.ownerId === actor.id ? "member" : "staff";
    const appended = await this.store.appendMessage({
      guildId,
      threadId: thread.id,
      authorId: actor.id,
      side,
      body: this.#body(body),
    });
    if (!appended.ok) {
      throw new UserError(
        `Thread \`${thread.id}\` is closed. Open a new thread with \`/modmail open\`.`,
      );
    }
    return { thread: appended.thread, message: appended.message };
  }

  async close(
    guildId: string,
    actor: ModmailActor,
    threadId: string,
    resolution?: string,
  ): Promise<ModmailCloseOutcome> {
    const thread = await this.#visible(guildId, actor, threadId);
    if (thread.state === "closed") {
      throw new UserError(`Thread \`${thread.id}\` is already closed.`);
    }

    const messages = await this.store.listMessages(guildId, thread.id, 1_000);
    const transcript = this.#transcript(guildId, thread, messages, actor.id);
    const checksum = createHash("sha256")
      .update(JSON.stringify(transcript))
      .digest("hex");

    const closed = await this.store.closeThread({
      guildId,
      threadId: thread.id,
      closedBy: actor.id,
      resolution: resolution?.trim() || undefined,
      transcript: JSON.stringify(transcript),
      transcriptChecksum: checksum,
      transcriptMessageCount: messages.length,
      at: new Date(this.now()).toISOString(),
    });
    if (!closed) {
      throw new UserError(`Thread \`${thread.id}\` is already closed.`);
    }
    return { thread: closed, transcript, checksum };
  }

  async transcript(
    guildId: string,
    actor: ModmailActor,
    threadId: string,
  ): Promise<ModmailTranscriptView> {
    const thread = await this.#visible(guildId, actor, threadId);
    const side: ModmailSide = thread.ownerId === actor.id ? "member" : "staff";
    await this.store.markRead(guildId, thread.id, side);

    if (thread.state === "closed" && thread.transcript) {
      const archived = JSON.parse(thread.transcript) as ModmailTranscript;
      return {
        thread,
        messages: archived.messages,
        archived: true,
        checksum: thread.transcriptChecksum,
      };
    }

    return {
      thread,
      messages: await this.store.listMessages(guildId, thread.id, 1_000),
      archived: false,
    };
  }

  async stats(guildId: string): Promise<ModmailStats> {
    return this.store.stats(guildId);
  }

  /** The staff queue: real active rows, newest activity first. */
  async active(guildId: string, limit = 10): Promise<ModmailThread[]> {
    const threads = await this.store.listThreads(guildId, { limit: 50 });
    return threads.filter((thread) => thread.state !== "closed").slice(0, limit);
  }

  #body(raw: string): string {
    const body = raw.trim();
    if (!body) throw new UserError("Write a message first.");
    if (body.length > this.settings.maxMessageLength) {
      throw new UserError(
        `A message can be at most ${this.settings.maxMessageLength} characters.`,
      );
    }
    return body;
  }

  async #visible(
    guildId: string,
    actor: ModmailActor,
    threadId: string,
  ): Promise<ModmailThread> {
    const thread = await this.store.getThread(guildId, threadId.trim());
    // Same text for missing and foreign threads: existence is private too.
    if (!thread || (thread.ownerId !== actor.id && !actor.staff)) {
      throw new UserError(`Mail thread \`${threadId}\` was not found.`);
    }
    return thread;
  }

  #transcript(
    guildId: string,
    thread: ModmailThread,
    messages: readonly ModmailMessage[],
    closedBy: string,
  ): ModmailTranscript {
    return {
      format: "keystone.modmail",
      version: 1,
      guildId,
      generatedAt: new Date(this.now()).toISOString(),
      thread: {
        id: thread.id,
        ownerId: thread.ownerId,
        subject: thread.subject,
        state: "closed",
        createdAt: thread.createdAt,
        claimedBy: thread.claimedBy,
        closedBy,
      },
      messages,
      counts: { messages: messages.length },
    };
  }

  #requireEnabled(action: string): void {
    if (!this.settings.enabled) {
      throw new UserError(
        `Modmail is disabled here. Enable it with \`/modmail setup enabled:true\` to ${action}.`,
      );
    }
  }
}
