import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
  type CommandInteractionOption,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type {
  ActionRow,
  CommandDefinition,
  CommandOption,
  InteractionLike,
  ReplyInput,
} from "@keystone/kernel";

/**
 * The only file in the repo allowed to know what a discord.js interaction looks
 * like. Everything downstream speaks `InteractionLike`, which is why every
 * command can be tested with a plain object.
 */
/**
 * Discord nests a subcommand's arguments inside the subcommand option. A
 * structural flat map is what the registry speaks, so walk the tree and keep
 * only leaf values: `{ user: "…", reason: "…" }`, not `{ ban: null }`.
 */
function flattenOptions(
  data: readonly CommandInteractionOption[],
): Record<string, string | number | boolean | null> {
  const flat: Record<string, string | number | boolean | null> = {};
  for (const option of data) {
    if (
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
    ) {
      Object.assign(flat, flattenOptions(option.options ?? []));
    } else {
      flat[option.name] = (option.value ?? null) as string | number | boolean | null;
    }
  }
  return flat;
}

export function asInteractionLike(interaction: ChatInputCommandInteraction): InteractionLike {
  return {
    id: interaction.id,
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    channelId: interaction.channelId ?? null,
    userId: interaction.user.id,
    options: flattenOptions(interaction.options.data),
    subcommand: interaction.options.getSubcommand(false) ?? undefined,
    subcommandGroup: interaction.options.getSubcommandGroup(false) ?? undefined,
    permissions: interaction.memberPermissions ? interaction.memberPermissions.toArray() : [],
    get replied() {
      return interaction.replied;
    },
    get deferred() {
      return interaction.deferred;
    },
    reply: (input) => interaction.reply(toReplyOptions(input)),
    deferReply: (input) => interaction.deferReply(input ?? {}),
    editReply: (input) => interaction.editReply(toEditOptions(input)),
    followUp: (input) => interaction.followUp(toReplyOptions(input)),
  };
}

/**
 * Our embed type is a structural subset of Discord's. One cast here beats
 * importing discord.js into 40 modules.
 */
function toReplyOptions(input: ReplyInput): InteractionReplyOptions {
  const { components, ...rest } = input;
  const options = rest as unknown as InteractionReplyOptions;
  if (components) options.components = toComponents(components);
  return options;
}

/**
 * Discord rejects the ephemeral flag on an edit, so edits get their own cast
 * instead of reusing the reply one.
 */
function toEditOptions(input: ReplyInput): InteractionEditReplyOptions {
  const { components, ...rest } = input;
  const options = rest as unknown as InteractionEditReplyOptions;
  if (components) options.components = toComponents(components);
  return options;
}

export function toComponents(rows: ActionRow[]): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  return rows.map((row) => {
    const builder = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>();
    builder.addComponents(
      row.components.map((component) => {
        if (component.type === "select") {
          const select = new StringSelectMenuBuilder()
            .setCustomId(component.customId)
            .setPlaceholder(component.placeholder)
            .setMinValues(component.minValues ?? 0)
            .setMaxValues(component.maxValues ?? 1)
            .addOptions(
              component.options.slice(0, 25).map((option) => {
                const item = new StringSelectMenuOptionBuilder()
                  .setLabel(option.label.slice(0, 100))
                  .setValue(option.value);
                if (option.description) item.setDescription(option.description.slice(0, 100));
                if (option.default) item.setDefault(true);
                return item;
              }),
            );
          if (component.disabled) select.setDisabled(true);
          return select;
        }
        const button = new ButtonBuilder().setLabel(component.label);
        if (component.style === "link") {
          button.setStyle(ButtonStyle.Link);
          if (component.url) button.setURL(component.url);
        } else {
          button.setStyle(STYLES[component.style]).setCustomId(component.customId);
        }
        if (component.disabled) button.setDisabled(true);
        return button;
      }),
    );
    return builder;
  });
}

const STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
} as const;

export function buildCommandJson(
  definition: CommandDefinition,
): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const builder = new SlashCommandBuilder()
    .setName(definition.name)
    .setDescription(definition.description);

  if (definition.groups?.length) {
    for (const group of definition.groups) {
      builder.addSubcommandGroup((groupBuilder) => {
        groupBuilder.setName(group.name).setDescription(group.description);
        for (const subcommand of group.subcommands) {
          groupBuilder.addSubcommand((subBuilder) => {
            subBuilder.setName(subcommand.name).setDescription(subcommand.description);
            for (const option of subcommand.options ?? []) addOption(subBuilder, option);
            return subBuilder;
          });
        }
        return groupBuilder;
      });
    }
  } else if (definition.subcommands?.length) {
    for (const subcommand of definition.subcommands) {
      builder.addSubcommand((subBuilder) => {
        subBuilder.setName(subcommand.name).setDescription(subcommand.description);
        for (const option of subcommand.options ?? []) addOption(subBuilder, option);
        return subBuilder;
      });
    }
  } else {
    for (const option of definition.options ?? []) addOption(builder, option);
  }

  return builder.toJSON();
}

function addOption(
  builder: SlashCommandBuilder | SlashCommandSubcommandBuilder,
  option: CommandOption,
): void {
  const { name, description } = option;
  const required = option.required ?? false;

  switch (option.type) {
    case "string":
      builder.addStringOption((o) => {
        o.setName(name).setDescription(description).setRequired(required);
        if (option.choices) {
          o.addChoices(...option.choices.map((c) => ({ name: c.name, value: String(c.value) })));
        }
        return o;
      });
      break;

    case "integer":
      builder.addIntegerOption((o) => {
        o.setName(name).setDescription(description).setRequired(required);
        if (option.minValue !== undefined) o.setMinValue(option.minValue);
        if (option.maxValue !== undefined) o.setMaxValue(option.maxValue);
        if (option.choices) {
          o.addChoices(...option.choices.map((c) => ({ name: c.name, value: Number(c.value) })));
        }
        return o;
      });
      break;

    case "number":
      builder.addNumberOption((o) => {
        o.setName(name).setDescription(description).setRequired(required);
        if (option.minValue !== undefined) o.setMinValue(option.minValue);
        if (option.maxValue !== undefined) o.setMaxValue(option.maxValue);
        return o;
      });
      break;

    case "boolean":
      builder.addBooleanOption((o) => o.setName(name).setDescription(description).setRequired(required));
      break;

    case "user":
      builder.addUserOption((o) => o.setName(name).setDescription(description).setRequired(required));
      break;

    case "channel":
      builder.addChannelOption((o) => o.setName(name).setDescription(description).setRequired(required));
      break;

    case "role":
      builder.addRoleOption((o) => o.setName(name).setDescription(description).setRequired(required));
      break;

    case "mentionable":
      builder.addMentionableOption((o) =>
        o.setName(name).setDescription(description).setRequired(required),
      );
      break;

    case "attachment":
      builder.addAttachmentOption((o) =>
        o.setName(name).setDescription(description).setRequired(required),
      );
      break;
  }
}
