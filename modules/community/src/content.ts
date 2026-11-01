import { randomUUID } from "node:crypto";
import { UserError } from "@keystone/kernel";
import type {
  ActionRow,
  CommunityActions,
  CommunityStore,
  EmbedField,
  EmbedPayload,
} from "@keystone/kernel";
import type { CommunitySettings } from "./settings";

function button(
  customId: string,
  label: string,
  style: "primary" | "secondary" | "success" | "danger" = "primary",
): ActionRow {
  return {
    type: "action-row",
    components: [{ type: "button", customId, label, style }],
  };
}

export interface EmbedInput {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
}

export interface ReminderRecord {
  id: string;
  userId: string;
  channelId?: string;
  dueAt: string;
  text: string;
  sent: boolean;
}

export interface PollRecord {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string[]>;
  channelId: string;
  messageId?: string;
}

export interface FeedRecord {
  id: string;
  url: string;
  channelId: string;
  lastGuid?: string;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function parseRss(xml: string): { title: string; link: string; guid: string } | undefined {
  const item = xml.match(/<item\b[\s\S]*?<\/item>/i)?.[0];
  if (!item) return undefined;
  const pick = (tag: string): string | undefined =>
    item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim();
  const title = pick("title");
  const link = pick("link");
  if (!title || !link) return undefined;
  return {
    title: title.replace(/<!\[CDATA\[|\]\]>/g, "").slice(0, 300),
    link,
    guid: pick("guid") ?? link,
  };
}

export class ContentService {
  constructor(
    private readonly store: CommunityStore,
    private readonly actions: CommunityActions,
    private readonly settings: CommunitySettings,
    private readonly now: () => number = Date.now,
  ) {}

  async createEmbed(
    guildId: string,
    channelId: string,
    name: string,
    input: EmbedInput,
  ): Promise<{ messageId: string }> {
    const title = input.title?.trim();
    const description = input.description?.trim();
    if (!title && !description) throw new UserError("An embed needs a title or description.");
    const fields = (input.fields ?? []).slice(0, 25);
    const total =
      (title?.length ?? 0) +
      (description?.length ?? 0) +
      fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    if (total > 6_000) throw new UserError("That embed is over Discord's 6,000-character limit.");
    const embed: EmbedPayload = {
      title: title?.slice(0, 256),
      description: description?.slice(0, 4_000),
      color: input.color ?? 0x5865f2,
      fields,
    };

    const existing = await this.store.getRecord(guildId, "embed", name);
    if (!existing) {
      const count = await this.store.listRecords(guildId, "embed", 100);
      if (count.length >= this.settings.content.maxEmbeds) {
        throw new UserError(`This server has reached ${this.settings.content.maxEmbeds} saved embeds.`);
      }
    }
    const result = await this.actions.sendMessage(guildId, channelId, { embeds: [embed] });
    if (!result.ok || !result.id) throw new Error(result.detail ?? "Could not send embed");
    await this.store.putRecord(guildId, "embed", name, { ...embed, messageId: result.id, channelId });
    return { messageId: result.id };
  }

  async createTag(
    guildId: string,
    name: string,
    value: string,
    ownerId: string,
  ): Promise<void> {
    const clean = name.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(clean)) {
      throw new UserError("Tag names use 1–32 letters, digits, `_` or `-`.");
    }
    if (!value.trim()) throw new UserError("A tag cannot be empty.");
    const records = await this.store.listRecords(guildId, "tag", 100);
    if (records.length >= this.settings.content.maxTags && !records.some((record) => record.key === clean)) {
      throw new UserError(`This server has reached ${this.settings.content.maxTags} tags.`);
    }
    await this.store.putRecord(guildId, "tag", clean, {
      name: clean,
      value: value.slice(0, 2_000),
      ownerId,
    });
  }

  async getTag(guildId: string, name: string): Promise<string | undefined> {
    const record = await this.store.getRecord<{ value: string }>(
      guildId,
      "tag",
      name.trim().toLowerCase(),
    );
    return record?.data.value;
  }

  async createReminder(
    guildId: string,
    userId: string,
    channelId: string | undefined,
    text: string,
    dueAt: string,
  ): Promise<ReminderRecord> {
    if (new Date(dueAt).getTime() <= this.now()) {
      throw new UserError("A reminder must be in the future.");
    }
    const record: ReminderRecord = {
      id: randomUUID(),
      userId,
      channelId,
      dueAt,
      text: text.slice(0, 1_500),
      sent: false,
    };
    await this.store.putRecord(guildId, "reminder", record.id, record);
    return record;
  }

  async scheduleMessage(
    guildId: string,
    channelId: string,
    text: string,
    dueAt: string,
  ): Promise<ReminderRecord> {
    if (new Date(dueAt).getTime() <= this.now()) {
      throw new UserError("A scheduled message must be in the future.");
    }
    const record: ReminderRecord = {
      id: randomUUID(),
      userId: "server",
      channelId,
      dueAt,
      text: text.slice(0, 1_500),
      sent: false,
    };
    await this.store.putRecord(guildId, "scheduled_message", record.id, record);
    return record;
  }

  async createPoll(
    guildId: string,
    channelId: string,
    question: string,
    options: string[],
  ): Promise<PollRecord> {
    if (options.length < 2 || options.length > 5) {
      throw new UserError("A poll needs 2–5 options.");
    }
    const id = randomUUID();
    const record: PollRecord = {
      id,
      question: question.slice(0, 200),
      options: options.map((option) => option.slice(0, 80)),
      votes: {},
      channelId,
    };
    const result = await this.actions.sendMessage(guildId, channelId, {
      embeds: [
        {
          title: `📊 ${record.question}`,
          description: record.options.map((option, index) => `${index + 1}. ${option}`).join("\n"),
          color: 0x5865f2,
        },
      ],
      components: [
        {
          type: "action-row",
          components: record.options.map((option, index) => ({
            type: "button",
            customId: `keystone:poll:${id}:${index}`,
            label: `${index + 1}`,
            style: "secondary" as const,
          })),
        },
      ],
    });
    record.messageId = result.id;
    await this.store.putRecord(guildId, "poll", id, record);
    return record;
  }

  async vote(
    guildId: string,
    pollId: string,
    userId: string,
    optionIndex: number,
  ): Promise<{ counts: number[]; total: number }> {
    const record = await this.store.getRecord<PollRecord>(guildId, "poll", pollId);
    if (!record) throw new UserError("That poll does not exist.");
    if (optionIndex < 0 || optionIndex >= record.data.options.length) {
      throw new UserError("That poll option does not exist.");
    }
    const votes = { ...record.data.votes };
    for (const key of Object.keys(votes)) {
      votes[key] = (votes[key] ?? []).filter((id) => id !== userId);
    }
    const bucket = votes[String(optionIndex)] ?? [];
    votes[String(optionIndex)] = [...bucket, userId];
    await this.store.putRecord(guildId, "poll", pollId, { ...record.data, votes });
    const counts = record.data.options.map((_, index) => votes[String(index)]?.length ?? 0);
    return { counts, total: counts.reduce((sum, value) => sum + value, 0) };
  }

  async addFeed(guildId: string, url: string, channelId: string): Promise<FeedRecord> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new UserError("Feed URL must be a valid http(s) URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new UserError("Feed URL must use http or https.");
    }
    const existing = await this.store.listRecords(guildId, "feed", 100);
    if (existing.length >= this.settings.feeds.max) {
      throw new UserError(`This server has reached ${this.settings.feeds.max} feeds.`);
    }
    const record: FeedRecord = { id: randomUUID(), url: parsed.toString(), channelId };
    await this.store.putRecord(guildId, "feed", record.id, record);
    return record;
  }

  async pollFeed(
    guildId: string,
    feedId: string,
    xml: string,
  ): Promise<{ posted: boolean; title?: string }> {
    const record = await this.store.getRecord<FeedRecord>(guildId, "feed", feedId);
    if (!record) throw new UserError("That feed does not exist.");
    const item = parseRss(xml);
    if (!item) return { posted: false };
    if (record.data.lastGuid === item.guid) return { posted: false, title: item.title };
    const result = await this.actions.sendMessage(guildId, record.data.channelId, {
      embeds: [{ title: item.title, url: item.link, color: 0x3498db }],
    });
    if (!result.ok) return { posted: false, title: item.title };
    await this.store.putRecord(guildId, "feed", feedId, { ...record.data, lastGuid: item.guid });
    return { posted: true, title: item.title };
  }

  async addStatChannel(
    guildId: string,
    channelId: string,
    metric: "members" | "online" | "boosters",
  ): Promise<void> {
    const existing = await this.store.listRecords(guildId, "stat_channel", 100);
    if (existing.length >= this.settings.statChannels.max) {
      throw new UserError(`This server has reached ${this.settings.statChannels.max} stat channels.`);
    }
    await this.store.putRecord(guildId, "stat_channel", channelId, { channelId, metric });
  }

  async refreshStat(
    guildId: string,
    channelId: string,
    value: number,
  ): Promise<boolean> {
    const record = await this.store.getRecord<{ metric: string }>(
      guildId,
      "stat_channel",
      channelId,
    );
    if (!record) return false;
    const label = record.data.metric.charAt(0).toUpperCase() + record.data.metric.slice(1);
    const result = await this.actions.setChannelName(guildId, channelId, `${label}: ${value}`);
    return result.ok;
  }

  async tick(guildId: string): Promise<{ reminders: number; scheduled: number }> {
    const now = this.now();
    let reminders = 0;
    let scheduled = 0;

    for (const record of await this.store.listRecords<ReminderRecord>(guildId, "reminder", 100)) {
      if (record.data.sent || new Date(record.data.dueAt).getTime() > now) continue;
      if (record.data.channelId) {
        await this.actions.sendMessage(guildId, record.data.channelId, {
          content: `<@${record.data.userId}> reminder: ${record.data.text}`,
        });
      } else {
        await this.actions.sendDM(record.data.userId, { content: `Reminder: ${record.data.text}` });
      }
      await this.store.putRecord(guildId, "reminder", record.key, { ...record.data, sent: true });
      reminders += 1;
    }

    for (const record of await this.store.listRecords<ReminderRecord>(guildId, "scheduled_message", 100)) {
      if (record.data.sent || new Date(record.data.dueAt).getTime() > now) continue;
      if (record.data.channelId) {
        await this.actions.sendMessage(guildId, record.data.channelId, {
          content: record.data.text,
        });
      }
      await this.store.putRecord(guildId, "scheduled_message", record.key, {
        ...record.data,
        sent: true,
      });
      scheduled += 1;
    }

    return { reminders, scheduled };
  }
}
