import type { V2Component } from "@keystone/kernel";
import { DEFAULT_LOCALE, t } from "@keystone/i18n";
import { MAX_SELECT_OPTIONS, layout } from "@keystone/ui";
import { CHANGELOG, VERSION } from "../changelog";
import type { HelpFacts, HelpModuleFacts } from "./facts";

/**
 * The help hub's visual surface. Every string comes from the i18n catalog and
 * every number from `HelpFacts`; nothing here is hard-coded to the current
 * command count. The panel builders are pure so a module test can inspect the
 * tree without a gateway.
 */
export const HELP_PANEL_TTL_MS = 15 * 60_000;
export const HELP_PANEL_TTL_MINUTES = HELP_PANEL_TTL_MS / 60_000;

/** Leaves room for the header, summaries and footer inside Discord's 4,000. */
const MODULE_BODY_BUDGET = 3_200;

export interface HelpPanelActions {
  /** Signed id for the module picker. */
  readonly browse: string;
  /** Signed id for the Overview button. */
  readonly home: string;
  readonly privacy: string;
  readonly changelog: string;
}

function moduleState(module: HelpModuleFacts, locale: string): string {
  if (module.enabled === undefined) return t(locale, "help.module.unknown");
  return t(locale, module.enabled ? "help.module.on" : "help.module.off");
}

function databaseState(facts: HelpFacts, locale: string): string {
  const database = facts.database;
  if (!database) return t(locale, "help.hub.state.unknown");
  if (!database.configured) return t(locale, "help.hub.state.memory");
  if (!database.reachable) return t(locale, "help.hub.state.unreachable");
  if (!database.migrated) return t(locale, "help.hub.state.pending");
  return t(locale, "help.hub.state.ready");
}

function cacheState(facts: HelpFacts, locale: string): string {
  const cache = facts.cache;
  if (!cache) return t(locale, "help.hub.state.unknown");
  if (!cache.reachable) return t(locale, "help.hub.state.unreachable");
  return t(
    locale,
    cache.detail === "redis" ? "help.hub.cache.redis" : "help.hub.state.memory",
  );
}

function countLabel(count: { count: number; capped: boolean }): string {
  return `${count.count}${count.capped ? "+" : ""}`;
}

function optionDescription(module: HelpModuleFacts, locale: string): string {
  return t(
    locale,
    "help.hub.option",
    module.roots,
    module.subcommands,
    moduleState(module, locale),
  ).slice(0, 100);
}

function moduleOptions(
  modules: readonly HelpModuleFacts[],
  locale: string,
  selected?: string,
): { label: string; value: string; description: string; default?: boolean }[] {
  return modules.slice(0, MAX_SELECT_OPTIONS).map((module) => ({
    label: module.name.slice(0, 100),
    value: module.id,
    description: optionDescription(module, locale),
    ...(selected === module.id ? { default: true } : {}),
  }));
}

function footer(minutes: number, locale: string): string {
  return t(locale, "help.hub.footer", minutes);
}

/**
 * The front door. The first block says what this server has and how it is
 * running; the second says what this bot can do. A member sees the same panel
 * as an owner, minus the case count that `/mod` already gates.
 */
export function helpHomePanel(
  facts: HelpFacts,
  actions: HelpPanelActions,
  locale: string = DEFAULT_LOCALE,
): V2Component[] {
  return layout((ui) => {
    ui.container({ accentColor: 0x5865f2 }, (box) => {
      box.text("## Keystone");
      box.text(t(locale, "about.description"));
      box.separator();

      const server = [`**${t(locale, "help.hub.server")}**`];
      server.push(
        facts.modulesKnown
          ? t(locale, "help.hub.modules", facts.modulesOn, facts.modulesTotal)
          : t(locale, "help.hub.modulesUnknown", facts.modulesTotal),
      );
      if (facts.tickets) {
        server.push(t(locale, "help.hub.tickets", countLabel(facts.tickets)));
      }
      if (facts.cases) {
        server.push(t(locale, "help.hub.cases", countLabel(facts.cases)));
      }
      server.push(t(locale, "help.hub.data", databaseState(facts, locale)));
      server.push(t(locale, "help.hub.cache", cacheState(facts, locale)));
      if (facts.disabledFeatures.length > 0) {
        server.push(
          t(locale, "help.hub.disabled", facts.disabledFeatures.slice(0, 4).join(", ")),
        );
      }
      box.text(server.join("\n"));
      box.separator();

      box.text(
        t(locale, "help.hub.registry", facts.roots, facts.subcommands, facts.menus),
      );
      if (facts.modules.length > MAX_SELECT_OPTIONS) {
        box.text(
          t(
            locale,
            "help.hub.optionLimit",
            facts.modules.length - MAX_SELECT_OPTIONS,
          ),
        );
      }
      box.actions([
        ui.select({
          customId: actions.browse,
          placeholder: t(locale, "help.hub.pick"),
          options: moduleOptions(facts.modules, locale),
        }),
      ]);
      box.actions([
        ui.button({
          style: "secondary",
          label: t(locale, "help.hub.button.privacy"),
          customId: actions.privacy,
        }),
        ui.button({
          style: "secondary",
          label: t(locale, "help.hub.button.changelog"),
          customId: actions.changelog,
        }),
      ]);
      box.text(footer(HELP_PANEL_TTL_MINUTES, locale));
    });
  });
}

/**
 * One module's roots and the subcommands below them. The body is built with a
 * character budget rather than handed to Discord to reject: a large module
 * shows the roots that fit and points at `/help commands module:<id>`.
 */
export function helpModulePanel(
  module: HelpModuleFacts,
  entries: readonly {
    readonly name: string;
    readonly subcommands: readonly {
      readonly name: string;
      readonly group?: string;
    }[];
  }[],
  actions: HelpPanelActions,
  locale: string = DEFAULT_LOCALE,
  modules: readonly HelpModuleFacts[] = [module],
): V2Component[] {
  const heading = `## ${module.name}`;
  const summary = t(
    locale,
    "help.module.summary",
    module.roots,
    module.subcommands,
    moduleState(module, locale),
  );

  const body: string[] = [];
  let used = heading.length + summary.length + 240;
  let shown = 0;
  for (const entry of entries) {
    const names = entry.subcommands.map((subcommand) =>
      subcommand.group
        ? `\`${subcommand.group} ${subcommand.name}\``
        : `\`${subcommand.name}\``,
    );
    const clipped =
      names.length > 12
        ? `${names.slice(0, 12).join(" ")} +${names.length - 12}`
        : names.join(" ");
    const line = `**/${entry.name}** · ${entry.subcommands.length}\n${clipped || "—"}`;
    if (used + line.length + 2 > MODULE_BODY_BUDGET) break;
    body.push(line);
    used += line.length + 2;
    shown += 1;
  }

  const hidden = entries.length - shown;
  if (hidden > 0) {
    body.push(t(locale, "help.module.more", hidden, module.id));
  }

  return layout((ui) => {
    ui.container({ accentColor: 0x57f287 }, (box) => {
      box.text(heading);
      box.text(summary);
      box.separator();
      box.text(body.join("\n\n"));
      if (module.enabled === false) {
        box.text(t(locale, "help.module.offHint"));
      }
      box.actions([
        ui.select({
          customId: actions.browse,
          placeholder: t(locale, "help.hub.pick"),
          // Keep every module in the picker: switching pages should not need
          // a trip through Overview first.
          options: moduleOptions(modules, locale, module.id),
        }),
      ]);
      box.actions([
        ui.button({
          style: "secondary",
          label: t(locale, "help.page.overview"),
          customId: actions.home,
        }),
      ]);
      box.text(t(locale, "help.page.footer", HELP_PANEL_TTL_MINUTES));
    });
  });
}

export function helpPrivacyPanel(
  actions: Pick<HelpPanelActions, "home">,
  locale: string = DEFAULT_LOCALE,
): V2Component[] {
  return layout((ui) => {
    ui.container({ accentColor: 0x57f287 }, (box) => {
      box.text(`## ${t(locale, "help.privacy.title")}`);
      box.text(t(locale, "help.privacy.body"));
      box.separator();
      box.actions([
        ui.button({
          style: "secondary",
          label: t(locale, "help.page.overview"),
          customId: actions.home,
        }),
      ]);
      box.text(t(locale, "help.page.footer", HELP_PANEL_TTL_MINUTES));
    });
  });
}

/** `pass-75` is a machine id; a user reads "Pass 75". */
function displayPass(pass: string): string {
  return pass.replace(/^pass-/, "Pass ");
}

export function helpChangelogPanel(
  actions: Pick<HelpPanelActions, "home">,
  locale: string = DEFAULT_LOCALE,
): V2Component[] {
  const lines = [
    t(
      locale,
      "help.changelog.latest",
      VERSION,
      displayPass(CHANGELOG[0]?.pass ?? "unknown"),
    ),
    ...(locale === DEFAULT_LOCALE
      ? []
      : [t(locale, "help.changelog.englishNote")]),
    ...CHANGELOG.slice(0, 3).map((entry) =>
      t(
        locale,
        "help.changelog.entry",
        displayPass(entry.pass),
        entry.date,
        entry.summary,
      ),
    ),
  ];
  return layout((ui) => {
    ui.container({ accentColor: 0x5865f2 }, (box) => {
      box.text(`## ${t(locale, "help.changelog.title")}`);
      box.separator();
      box.text(lines.join("\n"));
      box.text(
        t(locale, "help.changelog.journal", CHANGELOG[0]?.journal ?? "memory/journal"),
      );
      box.actions([
        ui.button({
          style: "secondary",
          label: t(locale, "help.page.overview"),
          customId: actions.home,
        }),
      ]);
      box.text(t(locale, "help.page.footer", HELP_PANEL_TTL_MINUTES));
    });
  });
}
