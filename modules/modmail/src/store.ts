import { randomUUID } from "node:crypto";
import type {
  ModmailAppendResult,
  ModmailCloseInput,
  ModmailCreateResult,
  ModmailMessage,
  ModmailSide,
  ModmailState,
  ModmailStats,
  ModmailStore,
  ModmailThread,
  ModmailThreadFilter,
  NewModmailMessage,
  NewModmailThread,
} from "@keystone/kernel";

const nowIso = (): string => new Date().toISOString();

/**
 * In-memory modmail store.
 *
 * It is a real store, not a mock: one active thread per member, an append-only
 * message log, unread counters, a first-staff-reply claim and a close that
 * stores the transcript once. Tests use it; a deployment swaps the Postgres
 * adapter behind the same port.
 */
export class InMemoryModmailStore implements ModmailStore {
  readonly #threads = new Map<string, ModmailThread>();
  readonly #messages = new Map<string, ModmailMessage>();

  async createThread(input: NewModmailThread): Promise<ModmailCreateResult> {
    const active = await this.getActiveThread(input.guildId, input.ownerId);
    if (active) return { ok: false, reason: "active-exists", thread: active };

    const at = nowIso();
    const thread: ModmailThread = {
      id: randomUUID(),
      guildId: input.guildId,
      ownerId: input.ownerId,
      subject: input.subject,
      state: "open",
      memberUnread: 0,
      staffUnread: 1,
      messageCount: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.#threads.set(thread.id, thread);
    const message: ModmailMessage = {
      id: randomUUID(),
      guildId: input.guildId,
      threadId: thread.id,
      authorId: input.authorId,
      side: "member",
      body: input.body,
      createdAt: at,
    };
    this.#messages.set(message.id, message);
    return { ok: true, thread };
  }

  async getThread(guildId: string, threadId: string): Promise<ModmailThread | undefined> {
    const thread = this.#threads.get(threadId);
    return thread?.guildId === guildId ? thread : undefined;
  }

  async getActiveThread(
    guildId: string,
    ownerId: string,
  ): Promise<ModmailThread | undefined> {
    return [...this.#threads.values()].find(
      (thread) =>
        thread.guildId === guildId &&
        thread.ownerId === ownerId &&
        thread.state !== "closed",
    );
  }

  async listThreads(
    guildId: string,
    filter: ModmailThreadFilter = {},
  ): Promise<ModmailThread[]> {
    return [...this.#threads.values()]
      .filter(
        (thread) =>
          thread.guildId === guildId &&
          (!filter.state || thread.state === filter.state) &&
          (!filter.ownerId || thread.ownerId === filter.ownerId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.min(Math.max(filter.limit ?? 50, 1), 100));
  }

  async appendMessage(input: NewModmailMessage): Promise<ModmailAppendResult> {
    const current = this.#threads.get(input.threadId);
    if (!current || current.guildId !== input.guildId) {
      throw new Error("Thread not found");
    }
    if (current.state === "closed") return { ok: false, reason: "closed" };

    const at = nowIso();
    const message: ModmailMessage = {
      id: randomUUID(),
      guildId: input.guildId,
      threadId: input.threadId,
      authorId: input.authorId,
      side: input.side,
      body: input.body,
      createdAt: at,
    };
    this.#messages.set(message.id, message);

    const claiming = current.state === "open" && input.side === "staff";
    const thread: ModmailThread = {
      ...current,
      state: claiming ? "claimed" : current.state,
      claimedBy: claiming ? input.authorId : current.claimedBy,
      claimedAt: claiming ? at : current.claimedAt,
      messageCount: current.messageCount + 1,
      staffUnread: current.staffUnread + (input.side === "member" ? 1 : 0),
      memberUnread: current.memberUnread + (input.side === "staff" ? 1 : 0),
      updatedAt: at,
    };
    this.#threads.set(thread.id, thread);
    return { ok: true, message, thread };
  }

  async listMessages(
    guildId: string,
    threadId: string,
    limit = 200,
  ): Promise<ModmailMessage[]> {
    return [...this.#messages.values()]
      .filter((message) => message.guildId === guildId && message.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.min(Math.max(limit, 1), 1_000));
  }

  async closeThread(input: ModmailCloseInput): Promise<ModmailThread | undefined> {
    const current = this.#threads.get(input.threadId);
    if (!current || current.guildId !== input.guildId || current.state === "closed") {
      return undefined;
    }
    const thread: ModmailThread = {
      ...current,
      state: "closed" as ModmailState,
      closedBy: input.closedBy,
      closedAt: input.at,
      resolution: input.resolution,
      transcript: input.transcript,
      transcriptChecksum: input.transcriptChecksum,
      transcriptMessageCount: input.transcriptMessageCount,
      memberUnread: 0,
      staffUnread: 0,
      updatedAt: input.at,
    };
    this.#threads.set(thread.id, thread);
    return thread;
  }

  async markRead(guildId: string, threadId: string, side: ModmailSide): Promise<boolean> {
    const current = this.#threads.get(threadId);
    if (!current || current.guildId !== guildId) return false;
    this.#threads.set(threadId, {
      ...current,
      memberUnread: side === "member" ? 0 : current.memberUnread,
      staffUnread: side === "staff" ? 0 : current.staffUnread,
      updatedAt: nowIso(),
    });
    return true;
  }

  async stats(guildId: string): Promise<ModmailStats> {
    const threads = [...this.#threads.values()].filter(
      (thread) => thread.guildId === guildId,
    );
    const messages = [...this.#messages.values()].filter(
      (message) => message.guildId === guildId,
    );
    return {
      total: threads.length,
      open: threads.filter((thread) => thread.state === "open").length,
      claimed: threads.filter((thread) => thread.state === "claimed").length,
      closed: threads.filter((thread) => thread.state === "closed").length,
      messages: messages.length,
      staffUnread: threads.reduce((sum, thread) => sum + thread.staffUnread, 0),
    };
  }
}
