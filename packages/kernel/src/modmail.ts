/**
 * Private member-to-staff mail, structurally.
 *
 * A thread is owned by the member who opened it. Only that member and staff may
 * read or write it, and closing archives the conversation exactly once. Those
 * three rules are the product, so the store owns the structural guarantees:
 * one active thread per member, one append-only message log, and a conditional
 * close that cannot write a second transcript.
 */

export type ModmailState = "open" | "claimed" | "closed";
export type ModmailSide = "member" | "staff";

export interface ModmailThread {
  readonly id: string;
  readonly guildId: string;
  readonly ownerId: string;
  readonly subject: string;
  readonly state: ModmailState;
  readonly claimedBy?: string;
  readonly claimedAt?: string;
  readonly closedBy?: string;
  readonly closedAt?: string;
  readonly resolution?: string;
  /** Staff replies the owner has not read yet. */
  readonly memberUnread: number;
  /** Member messages the staff have not read yet. */
  readonly staffUnread: number;
  readonly messageCount: number;
  /** Archived JSON, present only after a successful close. */
  readonly transcript?: string;
  readonly transcriptChecksum?: string;
  readonly transcriptMessageCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewModmailThread {
  readonly guildId: string;
  readonly ownerId: string;
  readonly subject: string;
  readonly body: string;
  readonly authorId: string;
}

export interface ModmailMessage {
  readonly id: string;
  readonly guildId: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly side: ModmailSide;
  readonly body: string;
  readonly createdAt: string;
}

export interface NewModmailMessage {
  readonly guildId: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly side: ModmailSide;
  readonly body: string;
}

export interface ModmailThreadFilter {
  readonly state?: ModmailState;
  readonly ownerId?: string;
  readonly limit?: number;
}

export type ModmailCreateResult =
  | { readonly ok: true; readonly thread: ModmailThread }
  /** The member already has an open or claimed thread. */
  | { readonly ok: false; readonly reason: "active-exists"; readonly thread: ModmailThread };

export type ModmailAppendResult =
  | { readonly ok: true; readonly message: ModmailMessage; readonly thread: ModmailThread }
  | { readonly ok: false; readonly reason: "closed" };

export interface ModmailCloseInput {
  readonly guildId: string;
  readonly threadId: string;
  readonly closedBy: string;
  readonly resolution?: string;
  /** Canonical transcript JSON without the checksum field. */
  readonly transcript: string;
  readonly transcriptChecksum: string;
  readonly transcriptMessageCount: number;
  readonly at: string;
}

export interface ModmailTranscript {
  readonly format: "keystone.modmail";
  readonly version: 1;
  readonly guildId: string;
  readonly generatedAt: string;
  readonly thread: {
    readonly id: string;
    readonly ownerId: string;
    readonly subject: string;
    readonly state: ModmailState;
    readonly createdAt: string;
    readonly claimedBy?: string;
    readonly closedBy?: string;
  };
  readonly messages: readonly ModmailMessage[];
  readonly counts: { readonly messages: number };
}

export interface ModmailStats {
  readonly total: number;
  readonly open: number;
  readonly claimed: number;
  readonly closed: number;
  readonly messages: number;
  readonly staffUnread: number;
}

/**
 * The one owner of modmail state. A caller never filters rows itself: every
 * read is guild-scoped and every close is conditional, so the service can only
 * turn typed results into accurate replies or refusals.
 */
export interface ModmailStore {
  /** Creates the thread and its first message together. */
  createThread(input: NewModmailThread): Promise<ModmailCreateResult>;
  getThread(guildId: string, threadId: string): Promise<ModmailThread | undefined>;
  getActiveThread(guildId: string, ownerId: string): Promise<ModmailThread | undefined>;
  listThreads(guildId: string, filter?: ModmailThreadFilter): Promise<ModmailThread[]>;
  /** Appends a message, updates unread counters and claims an open thread on the first staff reply. */
  appendMessage(input: NewModmailMessage): Promise<ModmailAppendResult>;
  listMessages(
    guildId: string,
    threadId: string,
    limit?: number,
  ): Promise<ModmailMessage[]>;
  /**
   * Closes only a thread that is still open or claimed, storing the transcript
   * in the same update. A second call returns undefined and writes nothing.
   */
  closeThread(input: ModmailCloseInput): Promise<ModmailThread | undefined>;
  /** Clears the counter for the side that just read the thread. */
  markRead(guildId: string, threadId: string, side: ModmailSide): Promise<boolean>;
  stats(guildId: string): Promise<ModmailStats>;
}
