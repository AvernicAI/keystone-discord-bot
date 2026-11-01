import { Events, type Client, type Message, type TextBasedChannel } from "discord.js";
import {
  UserError,
  dispatchCommand,
  type CommandDefinition,
  type DispatchDeps,
  type InteractionLike,
  type Logger,
  type ReplyInput,
} from "@keystone/kernel";
import { toComponents } from "./adapt";

/**
 * Development-only prefix commands.
 *
 * Slash commands are the product surface. This bridge exists because a Discord
 * MCP or another bot cannot invoke an application command: it can only post a
 * message. In a development guild, `!ping` and `!mod history` therefore run the
 * *same* registry, guards, cooldowns and adapters as `/ping` and `/mod history`.
 *
 * It is never registered in production and only answers in one configured
 * development guild, so the test seam cannot leak into a real server.
 */
export interface PrefixOptions {
  /** The single guild where prefix commands are honoured. */
  readonly guildId: string;
  /** Defaults to `!`. Kept short because it is typed into a chat box. */
  readonly prefix?: string;
}

export interface PrefixDeps extends DispatchDeps {
  readonly logger: Logger;
}

const MAX_CONTENT = 2_000;

/**
 * Split on whitespace, keeping quoted strings together and allowing
 * `key="some text with spaces"`. No shell escaping: Discord is not a shell.
 */
export function tokenizePrefix(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;

  for (const char of input) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }

  if (quote) throw new UserError("Unclosed quote in the prefix command.");
  if (started) tokens.push(current);
  return tokens;
}

export interface ParsedPrefix {
  readonly options: Record<string, string | number | boolean | null>;
  /** Human-readable example, shown when parsing fails. */
  readonly usage: string;
}

export function prefixUsage(definition: CommandDefinition): string {
  const parts = [`!${definition.name}`];
  for (const option of definition.options ?? []) {
    const example =
      option.type === "user"
        ? "@member"
        : option.type === "channel"
          ? "#channel"
          : option.type === "role"
            ? "@role"
            : option.type === "integer" || option.type === "number"
              ? "1"
              : option.type === "boolean"
                ? "true"
                : option.choices?.[0]?.value !== undefined
                  ? String(option.choices[0].value)
                  : "value";
    parts.push(`${option.name}=${option.required ? `<${example}>` : `[${example}]`}`);
  }
  return parts.join(" ");
}

function mentionId(value: string, type: "user" | "channel" | "role"): string | undefined {
  const pattern =
    type === "user" ? /^<@!?(\d{15,20})>$/ : type === "channel" ? /^<#(\d{15,20})>$/ : /^<@&(\d{15,20})>$/;
  const match = pattern.exec(value.trim());
  if (match) return match[1];
  return /^\d{15,20}$/.test(value.trim()) ? value.trim() : undefined;
}

/**
 * Parse `!command [action] [key=value ...]`.
 *
 * The first token may be the command's `action` choice because every hub
 * command starts with one; everything after that is named. Named-only
 * arguments are deliberately boring: the bridge is a test tool, and guessing
 * which of `subject`, `user` or `title` a bare word means would produce
 * surprising dispatches. Quoting covers values with spaces.
 */
export function parsePrefixArgs(
  definition: CommandDefinition,
  tokens: readonly string[],
): ParsedPrefix {
  const specs = definition.options ?? [];
  const options: Record<string, string | number | boolean | null> = {};
  const usage = prefixUsage(definition);
  let index = 0;

  if (specs[0]?.name === "action" && tokens.length > 0 && !(tokens[0] as string).includes("=")) {
    const action = tokens[0] as string;
    const allowed = (specs[0].choices ?? []).map((choice) => String(choice.value));
    if (allowed.length > 0 && !allowed.includes(action)) {
      throw new UserError(`Unknown action "${action}". Use one of: ${allowed.join(", ")}.`);
    }
    options.action = action;
    index = 1;
  }

  for (; index < tokens.length; index += 1) {
    const token = tokens[index] as string;
    const equals = token.indexOf("=");
    if (equals <= 0) {
      throw new UserError(`Expected key=value, got "${token}". Example: ${usage}`);
    }
    const key = token.slice(0, equals);
    const raw = token.slice(equals + 1);
    const spec = specs.find((option) => option.name === key);
    if (!spec) {
      throw new UserError(`Unknown option "${key}". Example: ${usage}`);
    }
    if (key in options) throw new UserError(`Option "${key}" was given twice.`);

    switch (spec.type) {
      case "string":
      case "mentionable": {
        if (spec.choices && spec.choices.length > 0) {
          const allowed = spec.choices.map((choice) => String(choice.value));
          if (!allowed.includes(raw)) {
            throw new UserError(`Option "${key}" must be one of: ${allowed.join(", ")}.`);
          }
        }
        options[key] = raw;
        break;
      }
      case "integer":
      case "number": {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) throw new UserError(`Option "${key}" must be a number.`);
        if (spec.type === "integer" && !Number.isInteger(parsed)) {
          throw new UserError(`Option "${key}" must be a whole number.`);
        }
        if (spec.minValue !== undefined && parsed < spec.minValue) {
          throw new UserError(`Option "${key}" must be at least ${spec.minValue}.`);
        }
        if (spec.maxValue !== undefined && parsed > spec.maxValue) {
          throw new UserError(`Option "${key}" must be at most ${spec.maxValue}.`);
        }
        options[key] = parsed;
        break;
      }
      case "boolean": {
        const normalized = raw.toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) options[key] = true;
        else if (["false", "0", "no", "off"].includes(normalized)) options[key] = false;
        else throw new UserError(`Option "${key}" must be true or false.`);
        break;
      }
      case "user":
      case "channel":
      case "role": {
        const id = mentionId(raw, spec.type);
        if (!id) throw new UserError(`Option "${key}" needs a ${spec.type} mention or id.`);
        options[key] = id;
        break;
      }
      case "attachment":
        throw new UserError(`Option "${key}" does not support attachments in prefix mode.`);
    }
  }

  for (const spec of specs) {
    if (spec.required && !(spec.name in options)) {
      throw new UserError(`Missing required option "${spec.name}". Example: ${usage}`);
    }
  }

  return { options, usage };
}

function sendable(channel: Message["channel"]): TextBasedChannel & {
  send(options: unknown): Promise<Message>;
} {
  if (!("send" in channel) || typeof channel.send !== "function") {
    throw new UserError("This channel cannot receive replies.");
  }
  return channel as TextBasedChannel & { send(options: unknown): Promise<Message> };
}

function toMessageBody(input: ReplyInput): Record<string, unknown> {
  const { components, ephemeral: _ephemeral, ...rest } = input;
  return {
    ...rest,
    content: input.content?.slice(0, MAX_CONTENT),
    components: components ? toComponents(components) : undefined,
    allowedMentions: { parse: [] },
  };
}

/**
 * Adapt a message to the same `InteractionLike` a slash command receives.
 * Replies are ordinary channel messages; ephemeral has no meaning for a
 * message, so it is ignored rather than pretending the reply is private.
 */
function asPrefixInteraction(
  message: Message,
  definition: CommandDefinition,
  parsed: ParsedPrefix,
): InteractionLike {
  let last: Message | undefined;
  let replied = false;
  let deferred = false;

  const send = async (input: ReplyInput): Promise<Message> => {
    const sent = await sendable(message.channel).send(toMessageBody(input));
    last = sent;
    replied = true;
    return sent;
  };

  return {
    id: `prefix-${message.id}`,
    commandName: definition.name,
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    options: parsed.options,
    permissions: message.member?.permissions.toArray() ?? [],
    get replied() {
      return replied;
    },
    get deferred() {
      return deferred;
    },
    reply: (input) => send(input),
    deferReply: async () => {
      deferred = true;
      const channel = sendable(message.channel);
      if ("sendTyping" in channel && typeof channel.sendTyping === "function") {
        await channel.sendTyping();
      }
    },
    editReply: async (input) => {
      if (!last) return send(input);
      const edited = await last.edit(toMessageBody(input) as never);
      return edited;
    },
    followUp: (input) => send(input),
  };
}

export function registerPrefixCommands(
  client: Client,
  deps: PrefixDeps,
  options: PrefixOptions,
): () => void {
  const prefix = options.prefix ?? "!";
  const logger = deps.logger.child("prefix");

  const onMessage = (message: Message): void => {
    if (message.author.id === client.user?.id) return;
    if (!message.content.startsWith(prefix)) return;
    if (message.guildId !== options.guildId) return;

    const [name, ...rest] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (!name) return;
    const registered = deps.registry.getCommand(name);
    if (!registered) return;

    let parsed: ParsedPrefix;
    try {
      parsed = parsePrefixArgs(registered.definition, tokenizePrefix(rest.join(" ")));
    } catch (error) {
      const content = error instanceof Error ? error.message : "Could not parse that command.";
      void message.reply({ content: content.slice(0, MAX_CONTENT), allowedMentions: { repliedUser: false } });
      return;
    }

    logger.warn("development prefix command", {
      command: name,
      guildId: message.guildId,
      userId: message.author.id,
    });
    void dispatchCommand(deps, asPrefixInteraction(message, registered.definition, parsed)).catch(
      (error: unknown) => {
        logger.error("prefix dispatch crashed", {
          command: name,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        });
      },
    );
  };

  client.on(Events.MessageCreate, onMessage);
  return () => client.off(Events.MessageCreate, onMessage);
}
