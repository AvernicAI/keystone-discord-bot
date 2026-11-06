import {
  WEBHOOK_EVENTS,
  type AnalyticsSnapshot,
  type ApiTokenRecord,
  type AuditEventRecord,
  type MusicControlState,
  type MusicLoopMode,
  type MusicQueue,
  type WebhookDelivery,
  type WebhookSubscription,
} from "@keystone/kernel";
import type {
  DashboardModule,
  DashboardView,
  FleetView,
  SavedTemplateDetail,
  SavedTemplateSummary,
} from "./overview";
import type { ConfigDrift, ConfigPlan } from "./config-bundle";
import type { DiscordGuild } from "./oauth";
import { encodePathSegment } from "./http";
import { clip, escapeHtml, timestamp } from "./html";
import {
  guildAvatar,
  icon,
  renderLegacyLayout,
  renderShell,
  type GuildSection,
  type LayoutOptions,
  type ShellGuild,
} from "./shell";
import { groupModules } from "./module-groups";
import type { GuildDirectory, DirectoryChannel, DirectoryRole } from "./directory";
import type { Readiness } from "./readiness";
import {
  labelFor,
  referenceChoices,
  type ReferenceChoice,
  type SettingsField,
  type SettingsFormModel,
  type SettingsGroup,
} from "./settings-form";
import type { ConfigTemplate, TemplateGuildPlan, TemplatePlan } from "./templates";
import type { RateLimitPolicies } from "./rate-limit";

/** Pages that still own their heading use the shell without a second h1. */
function layout(
  title: string,
  body: string,
  username?: string,
  options: Omit<LayoutOptions, "title" | "username" | "head"> = {},
): string {
  return renderLegacyLayout(title, body, username, options);
}

function guildLayout(guild: ShellGuild, section: GuildSection, csrfToken: string) {
  return { guild, section, csrfToken } as const;
}

export function renderLanding(username?: string, csrfToken?: string, owner = false): string {
  const cta = username
    ? `<a class="btn primary" href="/dashboard">Open your servers</a>
       <a class="btn ghost" href="/dashboard/fleet">Apply a template to a fleet</a>`
    : `<a class="btn primary" href="/login">Sign in with Discord</a>
       <span class="small muted">Manage Server is enough. No separate admin role.</span>`;
  const feature = (iconName: "shield" | "activity" | "database", title: string, text: string) =>
    `<div class="card tight feature">${icon(iconName)}<div><b>${escapeHtml(title)}</b><p class="small muted" style="margin:4px 0 0">${escapeHtml(text)}</p></div></div>`;
  return renderShell(
    {
      title: "Keystone",
      username,
      csrfToken,
      owner,
      head: false,
    },
    `<section class="hero">
      <div class="eyebrow">The all-in-one Discord bot that teaches while it runs</div>
      <h1>One server.<br>Every job. Nothing hidden.</h1>
      <p class="lede">Moderation, community, support and operations in one self-hosted bot. Manage Server is enough to open the dashboard, every accepted write is audited, and nothing is locked behind a paid tier.</p>
      <div class="hero-actions">${cta}</div>
      ${username ? `<p class="small muted" style="margin-top:16px">Signed in as <strong>${escapeHtml(username)}</strong>.</p>` : ""}
    </section>
    <div class="grid three" style="margin:34px 0 10px">
      ${feature("shield", "Evidence, not vibes", "Every moderation action, settings change and delivery has an actor and a receipt you can read.")}
      ${feature("activity", "A dashboard you can trust", "Schema-driven forms, a real audit trail, and counts that name the table they came from.")}
      ${feature("database", "Yours to keep", "Checksummed config bundles, export and restore, no lock-in and no per-feature paywall.")}
    </div>
    <div class="card" style="margin-top:22px">
      <div class="card-head"><div><h2>Start here</h2><p>${username ? "Pick a server, and its overview tells you what this install still needs." : "Sign in, pick a server, and the overview tells you what a fresh install still needs."}</p></div></div>
      <div class="tool-grid">
        <a class="tool" href="${username ? "/dashboard" : "/login"}"><b>${username ? "Your servers" : "Sign in"}</b><span>${username ? "Every server where you can manage settings." : "Discord OAuth; no bot token ever reaches the browser."}</span></a>
        <a class="tool" href="/dashboard/fleet"><b>Fleet templates</b><span>Preview one config across several servers before anything is written.</span></a>
        <a class="tool" href="/dashboard/instance"><b>Instance console</b><span>Deployment facts and sessions; owners only.</span></a>
      </div>
    </div>`,
  );
}

export function renderGuildList(
  username: string,
  guilds: DiscordGuild[],
  csrfToken: string,
): string {
  const cards = guilds
    .map(
      (guild) => `<a class="tool" href="/dashboard/guilds/${encodePathSegment(guild.id)}" style="display:flex;gap:12px;align-items:center">
        ${guildAvatar(guild)}
        <span style="min-width:0"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(guild.name)}</b>
        <span><code>${escapeHtml(guild.id)}</code> · <span class="nowrap">${guild.owner ? "owner" : "manage server"}</span></span></span>
      </a>`,
    )
    .join("");
  return renderShell(
    {
      title: "Your servers",
      eyebrow: "Keystone",
      lede: "Only servers where you own the server or hold Administrator / Manage Server are listed. The bot must also be in the server for its pages to load.",
      username,
      csrfToken,
      head: true,
      actions: `<a class="btn" href="/dashboard/fleet">Fleet view</a>`,
    },
    guilds.length === 0
      ? `<div class="empty"><strong>No manageable servers yet.</strong>Sign in with an account that can manage a server where Keystone is installed, or invite the bot to one. The <a href="/dashboard/fleet">fleet view</a> uses the same list, so it stays empty until then.</div>`
      : `<div class="tool-grid">${cards}</div>`,
  );
}

export interface OverviewOptions {
  readonly readiness: Readiness;
  readonly toggle?: { readonly moduleId: string; readonly state: "on" | "off" };
}

export function renderOverview(
  username: string,
  view: DashboardView,
  csrfToken: string,
  options: OverviewOptions,
): string {
  const base = `/dashboard/guilds/${encodePathSegment(view.guild.id)}`;
  const enabled = view.modules.filter((module) => module.enabled).length;
  const toggledModule = options.toggle
    ? view.modules.find((module) => module.id === options.toggle?.moduleId)
    : undefined;
  const notice = options.toggle
    ? `<div class="notice">${escapeHtml(toggledModule?.name ?? options.toggle.moduleId)} is now ${options.toggle.state === "on" ? "enabled" : "disabled"}. The change is in the <a href="${base}/activity">activity ledger</a>.</div>`
    : "";

  const facts = [
    `<span class="fact"><span class="dot ${enabled > 0 ? "ok" : "warn"}"></span><b>${enabled}/${view.modules.length}</b> modules on</span>`,
    `<span class="fact"><b>${view.counts.cases}</b> Cases</span>`,
    `<span class="fact"><b>${view.counts.openTickets}</b> open tickets</span>`,
    `<span class="fact"><b>${view.counts.levels}</b> level rows</span>`,
    `<span class="fact"><b>${view.counts.imports}</b> imports · <b>${view.counts.backups}</b> backups</span>`,
  ].join("");

  const readiness = options.readiness;
  const readinessPill = readiness.ready
    ? `<span class="pill ok">Ready</span>`
    : `<span class="pill warn">${readiness.done} of ${readiness.total}</span>`;
  const checklist = readiness.items
    .map(
      (item) => `<div class="check-item">
        <span class="check-mark${item.done ? " done" : ""}" aria-hidden="true">${item.done ? "✓" : "•"}</span>
        <span class="body"><span class="label">${escapeHtml(item.label)}</span><div class="detail">${escapeHtml(item.detail)}</div></span>
        ${item.done ? `<span class="pill ok">Done</span>` : `<a class="btn small" href="${escapeHtml(item.href)}">${escapeHtml(item.action)}</a>`}
      </div>`,
    )
    .join("");

  const groups = groupModules(view.modules)
    .map((group) => {
      const cards = group.modules
        .map((module) => {
          const dashboardModule = view.modules.find((entry) => entry.id === module.id);
          const isEnabled = dashboardModule?.enabled ?? false;
          const settingsHref = `${base}/settings/${encodePathSegment(module.id)}`;
          return `<article class="module">
            <div class="module-top"><h3>${escapeHtml(module.name)}</h3><span class="pill ${isEnabled ? "ok" : "off"}">${isEnabled ? "Enabled" : "Off"}</span></div>
            <p>${escapeHtml(module.description)}</p>
            <div class="module-foot">
              <span class="tiny muted">${dashboardModule?.commandCount ?? 0} command${(dashboardModule?.commandCount ?? 0) === 1 ? "" : "s"} · v${escapeHtml(module.version)}</span>
              <span style="display:flex;gap:6px">
                <a class="btn small" href="${settingsHref}">Configure</a>
                <form class="toggle-form" method="post" action="${base}/modules/${encodePathSegment(module.id)}/toggle">
                  <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
                  <input type="hidden" name="enabled" value="${isEnabled ? "0" : "1"}">
                  <button class="btn small ${isEnabled ? "ghost" : "primary"}" type="submit" aria-label="${isEnabled ? "Disable" : "Enable"} ${escapeHtml(module.name)}">${isEnabled ? "Disable" : "Enable"}</button>
                </form>
              </span>
            </div>
          </article>`;
        })
        .join("");
      return `<section aria-label="${escapeHtml(group.title)}">
        <div class="section-title">${escapeHtml(group.title)} <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">· ${escapeHtml(group.description)}</span></div>
        <div class="module-grid">${cards}</div>
      </section>`;
    })
    .join("");

  return renderShell(
    {
      title: view.guild.name,
      eyebrow: "Server overview",
      lede: `Guild ${view.guild.id} · ${view.guild.owner ? "you own this server" : "Manage Server access"} · settings writes are validated by each module and audited.`,
      username,
      csrfToken,
      guild: view.guild,
      section: "overview",
      head: true,
      actions: `<a class="btn primary" href="${base}/analytics">Analytics</a><a class="btn" href="${base}/activity">Activity</a>`,
    },
    `<div class="facts">${facts}</div>
     <section class="card" aria-label="Setup checklist">
       <div class="card-head"><div><h2>Get this server ready</h2><p>Four facts, read from the settings the bot actually uses. Nothing here is a score.</p></div>${readinessPill}</div>
       <div class="progress" aria-hidden="true"><span style="width:${Math.round((readiness.done / readiness.total) * 100)}%"></span></div>
       <div class="checklist">${checklist}</div>
     </section>
     <div class="section-title" id="modules">Module catalog <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">· ${enabled} of ${view.modules.length} on</span></div>
     ${notice}
     ${groups}
     <section class="card" style="margin-top:22px">
       <div class="card-head"><div><h2>Data and automation</h2><p>Portable settings, audited integrations and a read-only directory.</p></div><a class="card-link" href="${base}/templates">Templates</a></div>
       <div class="tool-grid">
         <a class="tool" href="${base}/directory"><b>Channels &amp; roles</b><span>Find the ids settings expect, without Developer Mode.</span></a>
         <a class="tool" href="${base}/config/drift"><b>Config &amp; drift</b><span>Export a bundle, preview an import, compare a baseline.</span></a>
         <a class="tool" href="${base}/tokens"><b>API tokens</b><span>Guild-scoped automation with three explicit scopes.</span></a>
         <a class="tool" href="${base}/webhooks"><b>Webhooks</b><span>Signed settings events with delivery receipts.</span></a>
       </div>
       <p class="small muted" style="margin:12px 0 0">${view.latestImport ? `Latest portability receipt: <code>${escapeHtml(view.latestImport.source)}</code> · ${escapeHtml(view.latestImport.state)} · ${escapeHtml(timestamp(view.latestImport.createdAt))}.` : "No portability receipt yet. Export a config bundle before a large change."} <a href="${base}/config/export">Export now</a>.</p>
     </section>`,
  );
}

export function renderAnalytics(
  username: string,
  guild: DiscordGuild,
  snapshot: AnalyticsSnapshot | null,
  days: number,
  csrfToken: string,
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/analytics`;
  const windowNav = [7, 30, 90]
    .map(
      (value) =>
        `<a class="btn small${value === days ? " primary" : ""}" href="${base}?days=${value}"${
          value === days ? ' aria-current="page"' : ""
        }>${value} days</a>`,
    )
    .join("");
  const chrome = {
    title: "Analytics",
    eyebrow: guild.name,
    lede: "Read-only aggregates over rows Keystone already stores. Every figure names its source; nothing on this page writes.",
    username,
    csrfToken,
    guild,
    section: "analytics" as const,
    head: true,
    actions: windowNav,
  };

  if (snapshot === null) {
    return renderShell(
      chrome,
      `<div class="form-error"><strong>Not available in this process.</strong>
        This dashboard has no shared analytics adapter (memory mode), so it will not show zeros as if they were measurements.
        Start the web process with <code>DATABASE_URL</code> to read this server's retained rows.</div>
       <div class="empty"><strong>Nothing is broken.</strong>The bot can still run in memory mode; only cross-process analytics is unavailable.
       <a href="/dashboard/instance">Check the instance mode</a>.</div>`,
    );
  }

  const { overview, members, messages, commands, tickets } = snapshot;
  const hasRows =
    overview.loggedEvents +
      overview.casesOpened +
      overview.inviteJoins +
      overview.commandsRun +
      tickets.opened +
      tickets.closedInWindow +
      overview.activeCases +
      overview.openTickets >
    0;

  const facts = [
    `<span class="fact"><span class="dot brand"></span><b>${snapshot.window.days}d · ${escapeHtml(snapshot.window.since.slice(0, 10))} → ${escapeHtml(snapshot.window.until.slice(0, 10))}</b></span>`,
    `<span class="fact">Generated <b>${escapeHtml(timestamp(snapshot.generatedAt))}</b></span>`,
    `<span class="fact"><span class="dot ${overview.loggedEvents > 0 ? "ok" : "warn"}"></span><b>${overview.loggedEvents}</b> logged events</span>`,
    `<span class="fact">Read <b>${escapeHtml(timestamp(new Date()))}</b></span>`,
  ].join("");

  const stats = [
    ["Logged events", overview.loggedEvents],
    ["Active cases", overview.activeCases],
    ["Cases opened", overview.casesOpened],
    ["Invite joins", overview.inviteJoins],
    ["Retained invites", overview.retainedInvites],
    ["Command runs", overview.commandsRun],
    ["Open tickets", overview.openTickets],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><span class="label">${escapeHtml(String(label))}</span><b>${Number(value)}</b></div>`,
    )
    .join("");

  const maxSource = Math.max(1, ...snapshot.sources.map((source) => source.rows));
  const sourceBars = snapshot.sources
    .map(
      (source) => `<div class="bar-row">
        <span class="source"><b>${escapeHtml(source.label)}</b><code>${escapeHtml(source.id)}</code></span>
        <span class="bar" aria-hidden="true"><span style="width:${
          source.rows === 0 ? 0 : Math.max(2, Math.round((source.rows / maxSource) * 100))
        }%"></span></span>
        <span class="num">${source.rows}</span>
      </div>`,
    )
    .join("");

  const topCommands = commands.top.length
    ? `<div class="table-wrap"><table><thead><tr><th>Command</th><th>Runs</th><th>Ok</th><th>Blocked</th><th>Error</th><th>Avg latency</th></tr></thead><tbody>${commands.top
        .map(
          (row) =>
            `<tr><td><code>/${escapeHtml(row.command)}${row.path ? ` ${escapeHtml(row.path)}` : ""}</code></td><td>${row.total}</td><td>${row.ok}</td><td>${row.blocked}</td><td>${row.error}</td><td>${row.averageLatencyMs === null ? "—" : `${row.averageLatencyMs}ms`}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="empty">No command runs recorded in this window. Command usage is written by dispatch; a quiet server is a valid answer.</div>`;

  const table = (rows: ReadonlyArray<readonly [string, string | number]>): string =>
    `<div class="table-wrap"><table><tbody>${rows
      .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`)
      .join("")}</tbody></table></div>`;

  return renderShell(
    chrome,
    `${facts}
     ${hasRows ? "" : `<div class="empty"><strong>No rows in this window.</strong>Zero can mean the relevant logging event or module is off, not that nothing happened. This is not an estimate of all Discord activity. <a href="${base.replace(/\/analytics$/, "")}/settings/logging">Set a logging channel</a> or widen the window.</div>`}
     <div class="grid">${stats}</div>
     <section class="card" style="margin-top:16px">
       <div class="card-head"><div><h2>Source rows</h2><p>Each bar is a query over one retained table; there is no analytics table or counter to reconcile.</p></div><span class="pill">${snapshot.sources.length} sources</span></div>
       ${sourceBars}
     </section>
     <div class="grid two">
       <section class="card">
         <div class="card-head"><div><h2>Members and invites</h2><p>Joins and leaves are audit-log events; invite attribution needs the invites module.</p></div></div>
         ${table([
           ["Logged joins", members.loggedJoins],
           ["Logged leaves", members.loggedLeaves],
           ["Invite joins", members.inviteJoins],
           ["Left since window start", members.leftSince],
           ["Retained", members.retained],
           ["Flagged joins", members.flagged],
           ["Unique inviters", members.uniqueInviters],
         ])}
       </section>
       <section class="card">
         <div class="card-head"><div><h2>Messages</h2><p>Only events captured by audit logging; message content is never included.</p></div></div>
         ${table([
           ["Deleted", messages.deleted],
           ["Edited", messages.edited],
           ["Content-filter cases", messages.contentFilterCases],
         ])}
         <hr class="sep">
         <h2 style="margin-bottom:8px">Tickets</h2>
         ${table([
           ["Open tickets (current)", tickets.open],
           ["Claimed tickets (current)", tickets.claimed],
           ["Closed tickets (current)", tickets.closed],
           ["Opened in window", tickets.opened],
           ["Closed in window", tickets.closedInWindow],
           ["Average close", tickets.averageCloseMinutes === null ? "—" : `${tickets.averageCloseMinutes} min`],
           ["SLA breached", tickets.slaBreached],
         ])}
       </section>
     </div>
     <section class="card">
       <div class="card-head"><div><h2>Commands</h2><p>${commands.total} runs · ${commands.ok} ok · ${commands.blocked} blocked · ${commands.error} error · average ${commands.averageLatencyMs === null ? "n/a" : `${commands.averageLatencyMs}ms`}</p></div></div>
       ${topCommands}
     </section>
     <p class="small faint">Open tickets and active cases are current state. Every other count is bounded by the window and is a count of retained rows, not estimates of all Discord activity.</p>`,
  );
}

export interface FleetNotice {
  readonly applied?: number;
  readonly failed?: number;
}

function settingText(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function renderFleet(
  username: string,
  view: FleetView,
  templates: readonly ConfigTemplate[],
  csrfToken: string,
  notice: FleetNotice = {},
): string {
  const noticeHtml = notice.applied !== undefined
    ? notice.applied > 0
      ? `<div class="notice">Template applied: ${notice.applied} module setting${notice.applied === 1 ? "" : "s"} written. Every write is in that module's audit trail.</div>`
      : `<div class="notice">Nothing to apply: the selected guilds already match this template.</div>`
    : "";
  const failureHtml = notice.failed && notice.failed > 0
    ? `<div class="form-error">${notice.failed} write${notice.failed === 1 ? "" : "s"} failed. The remaining writes were still attempted; review the audit trail and try again.</div>`
    : "";

  const rows = view.guilds
    .map((guild) => {
      const enabled = guild.modules
        .filter((module) => module.enabled === true)
        .map((module) => module.name);
      const unreadable = guild.modules.filter((module) => module.enabled === null).length;
      return `<tr>
        <td><input type="checkbox" name="guild" value="${escapeHtml(guild.id)}" aria-label="${escapeHtml(guild.name)}"></td>
        <td><a href="/dashboard/guilds/${encodePathSegment(guild.id)}">${escapeHtml(guild.name)}</a></td>
        <td class="muted">${escapeHtml(guild.id)}</td>
        <td>${enabled.length > 0 ? escapeHtml(enabled.join(", ")) : "<span class=\"muted\">none</span>"}${
          unreadable > 0
            ? ` <span class="muted">· ${unreadable} unreadable</span>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");

  const templateOptions = templates
    .map(
      (template, index) => `<div class="panel">
        <div class="field check">
          <input type="radio" id="template-${escapeHtml(template.id)}" name="template" value="${escapeHtml(template.id)}"${index === 0 ? " checked" : ""} required>
          <label for="template-${escapeHtml(template.id)}"><strong>${escapeHtml(template.name)}</strong></label>
        </div>
        <p class="muted">${escapeHtml(template.description)}</p>
        <p class="muted">Touches ${template.modules.map((entry) => escapeHtml(labelFor(entry.moduleId))).join(", ")}.</p>
      </div>`,
    )
    .join("");

  const form = view.guilds.length === 0
    ? `<p class="muted">No manageable servers yet. The fleet view lists the same guilds as the dashboard.</p>`
    : `<div class="panel">
        <h2>Apply a built-in template</h2>
        <p class="muted">Select servers and a template. Preview runs the template against each server's current settings and shows the exact diff; nothing is written until you confirm.</p>
        <form method="post" action="/dashboard/fleet/preview">
          <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
          <table><thead><tr><th></th><th>Server</th><th>ID</th><th>Enabled modules</th></tr></thead><tbody>${rows}</tbody></table>
          <fieldset><legend>Template</legend>${templateOptions}</fieldset>
          <p><button type="submit">Preview template</button></p>
        </form>
      </div>`;

  return layout(
    "Fleet",
    `<p><a href="/dashboard">← All servers</a></p>
     <h1>Fleet</h1>
     <p class="muted">One settings action across the servers you can manage. Each selected server is re-authorized, and every write goes through the module's own schema and audit trail.</p>
     ${noticeHtml}${failureHtml}${form}`,
    username,
  );
}

function renderPlanRows(modules: TemplateGuildPlan["modules"]): string {
  return modules
    .flatMap((module) => {
      const issueRows = module.issues.map(
        (issue) => `<tr><td>${escapeHtml(module.moduleName)}</td><td>${escapeHtml(
          issue.path.split(".").map(labelFor).join(" · "),
        )}</td><td colspan="2" class="error">${escapeHtml(issue.message)}</td></tr>`,
      );
      const changeRows = Object.entries(module.changes).map(
        ([path, change]) => `<tr><td>${escapeHtml(module.moduleName)}</td><td>${escapeHtml(
          path.split(".").map(labelFor).join(" · "),
        )}</td><td><code>${escapeHtml(settingText(change.from))}</code></td><td><code>${escapeHtml(settingText(change.to))}</code></td></tr>`,
      );
      return [...issueRows, ...changeRows];
    })
    .join("");
}

export interface TemplatePreviewOptions {
  readonly applyAction?: string;
  readonly includeTemplateField?: boolean;
  readonly backHref?: string;
  readonly backLabel?: string;
}

export function renderTemplatePreview(
  username: string,
  plan: TemplatePlan,
  csrfToken: string,
  options: TemplatePreviewOptions = {},
): string {
  const applyAction = options.applyAction ?? "/dashboard/fleet/apply";
  const includeTemplateField = options.includeTemplateField ?? true;
  const backHref = options.backHref ?? "/dashboard/fleet";
  const backLabel = options.backLabel ?? "Back to the fleet";
  const templateIssues = plan.templateIssues ?? [];
  const issuePanel = templateIssues.length > 0
    ? `<div class="form-error"><p><strong>This saved template does not validate against the current module schemas.</strong></p>
        <table><thead><tr><th>Setting</th><th>Problem</th></tr></thead><tbody>${templateIssues
          .map((issue) => `<tr><td>${escapeHtml(issue.path.split(".").map(labelFor).join(" · "))}</td><td>${escapeHtml(issue.message)}</td></tr>`)
          .join("")}</tbody></table>
      </div>`
    : "";

  const panels = plan.guilds
    .map((guildPlan) => {
      if (guildPlan.modules.length === 0) {
        return `<div class="panel"><h2>${escapeHtml(guildPlan.guild.name)}</h2><p class="muted">No changes in this guild.</p></div>`;
      }

      return `<div class="panel">
        <h2>${escapeHtml(guildPlan.guild.name)} <span class="muted">· ${escapeHtml(guildPlan.guild.id)}</span></h2>
        <table><thead><tr><th>Module</th><th>Setting</th><th>Before</th><th>After</th></tr></thead><tbody>${renderPlanRows(guildPlan.modules)}</tbody></table>
      </div>`;
    })
    .join("");

  const summary = templateIssues.length > 0
    ? `This template has ${templateIssues.length} schema issue${templateIssues.length === 1 ? "" : "s"}. Apply is disabled until it is refreshed or fixed.`
    : plan.issueCount > 0
      ? `${plan.changeCount} change${plan.changeCount === 1 ? "" : "s"} across ${plan.guilds.length} guild${plan.guilds.length === 1 ? "" : "s"}; ${plan.issueCount} schema issue${plan.issueCount === 1 ? "" : "s"}. Apply is disabled until they are resolved.`
      : `${plan.changeCount} change${plan.changeCount === 1 ? "" : "s"} across ${plan.guilds.length} guild${plan.guilds.length === 1 ? "" : "s"}. Nothing has been written yet.`;

  const hiddenGuilds = plan.guilds
    .map((guildPlan) => `<input type="hidden" name="guild" value="${escapeHtml(guildPlan.guild.id)}">`)
    .join("");
  const apply = plan.issueCount > 0
    ? `<div class="form-error">This preview has schema issues, so apply is disabled. Reset or fix the affected module, then preview again.</div>`
    : plan.changeCount === 0
      ? `<p class="muted">No changes to apply: the selected guilds already match this template.</p>`
      : `<form method="post" action="${escapeHtml(applyAction)}">
          <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
          ${includeTemplateField ? `<input type="hidden" name="template" value="${escapeHtml(plan.template.id)}">` : ""}
          <input type="hidden" name="fingerprint" value="${escapeHtml(plan.fingerprint)}">
          ${hiddenGuilds}
          <p><button type="submit">Apply to ${plan.guilds.length} guild${plan.guilds.length === 1 ? "" : "s"}</button></p>
        </form>`;

  return layout(
    `${plan.template.name} preview`,
    `<p><a href="${escapeHtml(backHref)}">← ${escapeHtml(backLabel)}</a></p>
     <h1>${escapeHtml(plan.template.name)}</h1>
     <p class="muted">${escapeHtml(plan.template.description)}</p>
     <div class="notice">${escapeHtml(summary)}</div>
     ${issuePanel}${panels}
     ${apply}`,
    username,
  );
}

export function renderConfigPreview(
  username: string,
  plan: ConfigPlan,
  bundleText: string,
  csrfToken: string,
): string {
  const rows = plan.modules.length === 0
    ? `<p class="muted">No changes: this guild already matches the bundle.</p>`
    : `<table><thead><tr><th>Module</th><th>Setting</th><th>Before</th><th>After</th></tr></thead><tbody>${renderPlanRows(plan.modules)}</tbody></table>`;
  const summary = plan.issueCount > 0
    ? `${plan.changeCount} change${plan.changeCount === 1 ? "" : "s"}; ${plan.issueCount} schema issue${plan.issueCount === 1 ? "" : "s"}. Apply is disabled.`
    : `${plan.changeCount} change${plan.changeCount === 1 ? "" : "s"} in ${plan.guild.name}. Nothing has been written yet.`;
  const action = `/dashboard/guilds/${encodePathSegment(plan.guild.id)}/config/import/apply`;
  const apply = plan.issueCount > 0
    ? `<div class="form-error">This bundle cannot be applied. Fix the reported fields and import it again.</div>`
    : `<form method="post" action="${action}">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="fingerprint" value="${escapeHtml(plan.fingerprint)}">
        <textarea name="bundle" hidden>${escapeHtml(bundleText)}</textarea>
        <p><button type="submit">Apply ${plan.changeCount} change${plan.changeCount === 1 ? "" : "s"}</button></p>
      </form>`;

  return layout(
    "Config import preview",
    `<p><a href="/dashboard/guilds/${encodePathSegment(plan.guild.id)}/config/drift">← Back to config and drift</a></p>
     <h1>Config import preview</h1>
     <p class="muted">Bundle from guild ${escapeHtml(plan.bundle.sourceGuildId)} · exported ${escapeHtml(plan.bundle.exportedAt)} · checksum <code>${escapeHtml(plan.bundle.checksum.slice(0, 12))}…</code> · ${plan.bundle.moduleCount} modules</p>
     <div class="notice">${escapeHtml(summary)}</div>
     <div class="panel"><h2>${escapeHtml(plan.guild.name)}</h2>${rows}</div>
     <div class="panel">
       <p class="muted">Apply re-parses and re-validates this exact file, recomputes the plan and refuses it if the checksum, the schemas or this guild's settings changed after the preview. Each accepted module write appends one dashboard audit row, and the bundle becomes this guild's baseline for drift.</p>
       ${apply}
     </div>`,
    username,
    guildLayout(plan.guild, "config", csrfToken),
  );
}

export interface ConfigDriftOptions {
  readonly imported?: number;
  readonly failed?: number;
  readonly importError?: string;
}

function configTime(ms: number): string {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "unknown" : `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function renderConfigDrift(
  username: string,
  guild: DiscordGuild,
  drift: ConfigDrift,
  csrfToken: string,
  options: ConfigDriftOptions = {},
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/config`;
  const notice = options.imported !== undefined
    ? `<div class="notice">Imported: ${options.imported} module setting${options.imported === 1 ? "" : "s"} written. Each accepted module write is in the audit trail, and this bundle is now the drift baseline.</div>`
    : "";
  const failure = options.failed && options.failed > 0
    ? `<div class="form-error">${options.failed} module write${options.failed === 1 ? "" : "s"} failed. The baseline was stored; review the audit trail and apply again.</div>`
    : "";
  const error = options.importError || drift.error;
  const errorHtml = error
    ? `<div class="form-error">${escapeHtml(error)}</div>`
    : "";

  const baseline = drift.baseline
    ? `<div class="panel"><h2>Baseline</h2>
        <p class="muted">source ${escapeHtml(drift.baseline.source)} · exported ${escapeHtml(drift.baseline.exportedAt || "unknown")} · from guild ${escapeHtml(drift.baseline.sourceGuildId || "unknown")} · stored ${escapeHtml(configTime(drift.baseline.createdAt))} · updated ${escapeHtml(configTime(drift.baseline.updatedAt))} · checksum <code>${escapeHtml(drift.baseline.checksum.slice(0, 12))}…</code></p>
      </div>`
    : `<div class="panel"><h2>Baseline</h2><p class="muted">No baseline yet. Applying an imported bundle stores it; until then there is nothing to compare.</p></div>`;

  const driftPanel = drift.baseline === null
    ? `<div class="panel"><h2>Drift</h2><p class="muted">Import a bundle to start a baseline.</p></div>`
    : drift.changeCount === 0 && drift.issueCount === 0
      ? `<div class="panel"><h2>Drift</h2><p class="muted">No drift: this guild's live settings match the baseline.</p></div>`
      : `<div class="panel"><h2>Drift <span class="muted">· baseline → live</span></h2>
          <p class="muted">${drift.changeCount} changed value${drift.changeCount === 1 ? "" : "s"}${drift.issueCount > 0 ? ` · ${drift.issueCount} unreadable value${drift.issueCount === 1 ? "" : "s"}` : ""}.</p>
          <table><thead><tr><th>Module</th><th>Setting</th><th>Baseline</th><th>Live</th></tr></thead><tbody>${renderPlanRows(drift.modules)}</tbody></table>
        </div>`;

  return layout(
    "Config and drift",
    `<p><a href="/dashboard/guilds/${encodePathSegment(guild.id)}">← Back to ${escapeHtml(guild.name)}</a></p>
     <h1>Config export, import and drift</h1>
     <p class="muted">A config bundle carries every module's effective settings and a checksum. Import validates it against the same Zod schemas the bot uses, previews the exact per-setting diff, and writes only after confirmation.</p>
     ${notice}${failure}${errorHtml}
     <div class="panel"><h2>Export</h2>
       <p class="muted">Download a portable JSON file. Stored values and schema defaults are included; credential-shaped keys are omitted.</p>
       <p><a href="${base}/export">Download config bundle</a></p>
     </div>
     <div class="panel"><h2>Import</h2>
       <p class="muted">Choose a bundle exported by any guild. Preview writes nothing; apply is bound to the preview and re-authorized.</p>
       <form method="post" enctype="multipart/form-data" action="${base}/import/preview">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="config-file">Config bundle (.json)</label><input id="config-file" type="file" name="file" accept="application/json,.json" required></div>
         <p><button type="submit">Preview import</button></p>
       </form>
     </div>
     ${baseline}
     ${driftPanel}`,
    username,
    guildLayout(guild, "config", csrfToken),
  );
}

export interface SavedTemplateNotice {
  readonly created?: boolean;
  readonly updated?: boolean;
  readonly deleted?: boolean;
  readonly applied?: number;
  readonly failed?: number;
  readonly history?: readonly AuditEventRecord[];
}

export function renderSavedTemplates(
  username: string,
  guild: DiscordGuild,
  templates: readonly SavedTemplateSummary[],
  csrfToken: string,
  notice: SavedTemplateNotice = {},
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/templates`;
  const noticeHtml = notice.created
    ? `<div class="notice">Saved. Open the template to edit it or preview an apply.</div>`
    : notice.deleted
      ? `<div class="notice">Template deleted. The deletion is in the audit trail.</div>`
      : "";
  const rows = templates
    .map(
      (template) => `<tr>
        <td><a href="${base}/${encodePathSegment(template.id)}">${escapeHtml(template.name)}</a>${
          template.invalidCount > 0
            ? ` <span class="error">· invalid (${template.invalidCount})</span>`
            : ""
        }</td>
        <td class="muted">${escapeHtml(template.description || "—")}</td>
        <td>${template.moduleCount}</td>
        <td class="muted">${escapeHtml(configTime(template.updatedAt))}</td>
      </tr>`,
    )
    .join("");

  return layout(
    "Saved templates",
    `<p><a href="/dashboard/guilds/${encodePathSegment(guild.id)}">← Back to ${escapeHtml(guild.name)}</a></p>
     <h1>Saved templates</h1>
     <p class="muted">A saved template is a snapshot of this server's effective module settings. It belongs to this server; applying it to another server always re-authorizes both and previews the exact diff first.</p>
     ${noticeHtml}
     <div class="panel"><h2>Your templates</h2>
       ${templates.length === 0
         ? `<p class="muted">No saved templates yet.</p>`
         : `<table><thead><tr><th>Name</th><th>Description</th><th>Modules</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`}
     </div>
     <div class="panel"><h2>Save the current settings</h2>
       <p class="muted">Every module's effective settings are re-parsed against its own Zod schema before the template is stored. Credential-shaped keys are omitted.</p>
       <form method="post" action="${base}">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="template-name">Name</label><input id="template-name" type="text" name="name" maxlength="60" required></div>
         <div class="field"><label for="template-description">Description</label><textarea id="template-description" name="description" rows="2" maxlength="280"></textarea></div>
         <p><button type="submit">Save template</button></p>
       </form>
     </div>`,
    username,
    guildLayout(guild, "templates", csrfToken),
  );
}

export function renderSavedTemplateEditor(
  username: string,
  guild: DiscordGuild,
  template: SavedTemplateDetail,
  targets: readonly DiscordGuild[],
  csrfToken: string,
  notice: SavedTemplateNotice = {},
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/templates`;
  const action = `${base}/${encodePathSegment(template.id)}`;
  const noticeHtml = notice.created
    ? `<div class="notice">Template saved from this server's current settings.</div>`
    : notice.updated
    ? `<div class="notice">Template updated. The edit is in the audit trail below.</div>`
    : notice.applied !== undefined
      ? `<div class="notice">${notice.applied} module setting${notice.applied === 1 ? "" : "s"} written across the selected servers. Every write is in that module's audit trail.</div>`
      : "";
  const failureHtml = notice.failed && notice.failed > 0
    ? `<div class="form-error">${notice.failed} write${notice.failed === 1 ? "" : "s"} failed. The remaining writes were attempted; review the audit trail and try again.</div>`
    : "";
  const issues = template.issues.length > 0
    ? `<div class="form-error"><p><strong>This template no longer validates against the current module schemas.</strong> It cannot be applied until it is refreshed from this server or deleted.</p>
        <table><thead><tr><th>Setting</th><th>Problem</th></tr></thead><tbody>${template.issues
          .map((issue) => `<tr><td>${escapeHtml(issue.path.split(".").map(labelFor).join(" · "))}</td><td>${escapeHtml(issue.message)}</td></tr>`)
          .join("")}</tbody></table>
      </div>`
    : "";

  const targetRows = targets
    .map(
      (target) => `<tr><td><input type="checkbox" name="guild" value="${escapeHtml(target.id)}" aria-label="${escapeHtml(target.name)}"${
        target.id === guild.id ? " checked" : ""
      }></td><td>${escapeHtml(target.name)}</td><td class="muted">${escapeHtml(target.id)}</td></tr>`,
    )
    .join("");
  const applyPanel = template.issues.length > 0
    ? `<div class="panel"><h2>Apply</h2><p class="muted">Apply is disabled while this template has schema issues.</p></div>`
    : targets.length === 0
      ? `<div class="panel"><h2>Apply</h2><p class="muted">No manageable servers are available.</p></div>`
      : `<div class="panel"><h2>Apply to servers</h2>
          <p class="muted">Select the servers to preview. Nothing is written until you confirm the diff; each selected server is re-authorized and every accepted module write is audited.</p>
          <form method="post" action="${action}/preview">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <table><thead><tr><th></th><th>Server</th><th>ID</th></tr></thead><tbody>${targetRows}</tbody></table>
            <p><button type="submit">Preview apply</button></p>
          </form>
        </div>`;

  return layout(
    `${template.name} template`,
    `<p><a href="${base}">← All saved templates</a></p>
     <h1>${escapeHtml(template.name)}</h1>
     <p class="muted">${escapeHtml(template.description || "No description.")} · ${template.moduleCount} modules · updated ${escapeHtml(configTime(template.updatedAt))} · created ${escapeHtml(configTime(template.createdAt))}</p>
     ${noticeHtml}${failureHtml}${issues}
     <div class="panel"><h2>Edit metadata</h2>
       <form method="post" action="${action}">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="template-name">Name</label><input id="template-name" type="text" name="name" maxlength="60" value="${escapeHtml(template.name)}" required></div>
         <div class="field"><label for="template-description">Description</label><textarea id="template-description" name="description" rows="2" maxlength="280">${escapeHtml(template.description)}</textarea></div>
         <div class="field check"><input id="refresh-settings" type="checkbox" name="refresh" value="1"><label for="refresh-settings">Replace the snapshot with this server's current settings</label></div>
         <p><button type="submit">Save changes</button></p>
       </form>
     </div>
     ${applyPanel}
     ${renderAudit(notice.history ?? [])}
     <div class="panel"><h2>Delete</h2>
       <p class="muted">Deleting removes the template and keeps its audit rows. It does not change any server's settings.</p>
       <form method="post" action="${action}/delete">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <p><button type="submit">Delete template</button></p>
       </form>
     </div>`,
    username,
    guildLayout(guild, "templates", csrfToken),
  );
}

function fieldId(path: string): string {
  return `f-${path.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function activeField(
  field: SettingsField,
  submitted: URLSearchParams | undefined,
  rendered: ReadonlySet<string> | undefined,
): boolean {
  if (!submitted) return false;
  return rendered ? rendered.has(field.path) : submitted.has(field.path);
}

function displayValue(
  field: SettingsField,
  submitted: URLSearchParams | undefined,
  rendered: ReadonlySet<string> | undefined,
): unknown {
  if (!activeField(field, submitted, rendered)) return field.value;
  if (field.kind === "boolean") return submitted?.has(field.path) ?? false;
  return submitted?.get(field.path) ?? "";
}

function linesText(value: unknown): string {
  return Array.isArray(value) ? value.map((entry) => String(entry)).join("\n") : "";
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2) ?? "";
  } catch {
    return "";
  }
}

function renderReferenceField(
  field: SettingsField,
  value: string,
  choices: readonly ReferenceChoice[],
  label: string,
  common: string,
  help: string,
  errorText: string,
): string {
  const noun = field.reference === "role" ? "role" : "channel";
  const blank = `<option value="">${field.nullable || field.optional ? "None" : `Choose a ${noun}`}</option>`;
  // A stored id the current read does not contain is kept, selected and
  // labelled: silently resetting it to None would erase a real setting.
  const unknown =
    value && !choices.some((choice) => choice.value === value)
      ? `<option value="${escapeHtml(value)}" selected>⚠ ${escapeHtml(value)} · not in this server</option>`
      : "";
  let options = "";
  let open: string | undefined;
  for (const choice of choices) {
    if (choice.group !== open) {
      if (open !== undefined) options += "</optgroup>";
      options += `<optgroup label="${escapeHtml(choice.group)}">`;
      open = choice.group;
    }
    options += `<option value="${escapeHtml(choice.value)}"${
      choice.value === value ? " selected" : ""
    }>${escapeHtml(choice.label)}</option>`;
  }
  if (open !== undefined) options += "</optgroup>";
  return `<div class="field">${label}<select ${common}>${blank}${unknown}${options}</select>${help}${errorText}</div>`;
}

function renderField(
  field: SettingsField,
  submitted: URLSearchParams | undefined,
  rendered: ReadonlySet<string> | undefined,
  errors: ReadonlyMap<string, string> | undefined,
  directory: GuildDirectory | undefined,
): string {
  const id = fieldId(field.path);
  const value = displayValue(field, submitted, rendered);
  const error = errors?.get(field.path);
  const help = field.help ? `<small id="${id}-help">${escapeHtml(field.help)}</small>` : "";
  const errorText = error ? `<p class="error" id="${id}-error">${escapeHtml(error)}</p>` : "";
  const describedBy = [field.help ? `${id}-help` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");
  const aria = `${describedBy ? ` aria-describedby="${describedBy}"` : ""}${error ? ' aria-invalid="true"' : ""}`;

  if (field.kind === "boolean") {
    const checked = value === true;
    return `<div class="field check">
      <input type="checkbox" id="${id}" name="${escapeHtml(field.path)}"${checked ? " checked" : ""}${aria}>
      <label for="${id}">${escapeHtml(field.label)}</label>
    </div>${help}${errorText}`;
  }

  if (field.kind === "literal") {
    return `<input type="hidden" name="${escapeHtml(field.path)}" value="${escapeHtml(String(value ?? ""))}">
      <div class="field"><span class="label">${escapeHtml(field.label)}</span><span class="muted">Fixed at ${escapeHtml(String(value ?? ""))}</span>${help}</div>${errorText}`;
  }

  const label = `<label for="${id}">${escapeHtml(field.label)}</label>`;
  const common = `id="${id}" name="${escapeHtml(field.path)}"${aria}`;

  if (field.kind === "number") {
    const min = field.min !== undefined ? ` min="${field.min}"` : "";
    const max = field.max !== undefined ? ` max="${field.max}"` : "";
    const step = field.step !== undefined ? ` step="${field.step}"` : "";
    return `<div class="field">${label}<input type="number" ${common}${min}${max}${step} value="${escapeHtml(String(value ?? ""))}">${help}${errorText}</div>`;
  }

  if (field.kind === "select") {
    const blank = field.nullable || field.optional ? `<option value="">None</option>` : "";
    const options = (field.options ?? [])
      .map((option) => `<option value="${escapeHtml(option)}"${String(value) === option ? " selected" : ""}>${escapeHtml(option)}</option>`)
      .join("");
    return `<div class="field">${label}<select ${common}>${blank}${options}</select>${help}${errorText}</div>`;
  }

  if (field.kind === "textarea") {
    return `<div class="field">${label}<textarea ${common} rows="4" spellcheck="false">${escapeHtml(String(value ?? ""))}</textarea>${help}${errorText}</div>`;
  }

  if (field.kind === "lines") {
    return `<div class="field">${label}<textarea ${common} rows="3" spellcheck="false" placeholder="One value per line">${escapeHtml(linesText(value))}</textarea>${help}${errorText}</div>`;
  }

  if (field.kind === "json") {
    return `<div class="field">${label}<textarea ${common} rows="5" spellcheck="false" aria-label="${escapeHtml(field.label)} JSON">${escapeHtml(jsonText(value))}</textarea>${help}${errorText}</div>`;
  }

  const choices = directory && field.reference ? referenceChoices(field, directory) : [];
  if (directory && field.reference && choices.length > 0) {
    return renderReferenceField(field, String(value ?? ""), choices, label, common, help, errorText);
  }

  const maxLength = field.max !== undefined ? ` maxlength="${field.max}"` : "";
  return `<div class="field">${label}<input type="text" ${common}${maxLength} value="${escapeHtml(String(value ?? ""))}">${help}${errorText}</div>`;
}

function renderGroup(
  group: SettingsGroup,
  submitted: URLSearchParams | undefined,
  rendered: ReadonlySet<string> | undefined,
  errors: ReadonlyMap<string, string> | undefined,
  directory: GuildDirectory | undefined,
): string {
  const fields = group.fields
    .map((field) => renderField(field, submitted, rendered, errors, directory))
    .join("");
  const groups = group.groups
    .map((child) => renderGroup(child, submitted, rendered, errors, directory))
    .join("");
  if (!fields && !groups) return "";
  // The root group is the module itself, not a titled section. Rendering it
  // as a fieldset drew one "General" box around every other group.
  if (!group.path) return `${fields}${groups}`;
  return `<fieldset><legend>${escapeHtml(group.label)}</legend>${fields}${groups}</fieldset>`;
}

function auditChanges(record: AuditEventRecord): string {
  const data = record.data;
  const changes = data && typeof data === "object" ? (data as Record<string, unknown>).changes : undefined;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return record.action;
  const paths = Object.keys(changes);
  if (paths.length === 0) return record.action;
  return paths.length > 6 ? `${paths.slice(0, 6).join(", ")} +${paths.length - 6} more` : paths.join(", ");
}

function auditAction(record: AuditEventRecord): string {
  if (record.action === "settings.update") return "Settings update";
  if (record.action === "settings.reset") return "Settings reset";
  if (record.action === "template.create") return "Template created";
  if (record.action === "template.update") return "Template updated";
  if (record.action === "template.delete") return "Template deleted";
  if (record.action === "api_token.issue") return "API token issued";
  if (record.action === "api_token.revoke") return "API token revoked";
  return record.action;
}

function auditTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function renderAudit(records: readonly AuditEventRecord[]): string {
  if (records.length === 0) {
    return `<div class="panel"><h2>Audit trail</h2><p class="muted">No settings changes have been recorded for this module yet.</p></div>`;
  }
  const rows = records
    .map(
      (record) =>
        `<tr><td>${escapeHtml(auditTime(record.createdAt))}</td><td>${escapeHtml(record.actorId ?? "system")}</td><td>${escapeHtml(auditAction(record))}</td><td>${escapeHtml(auditChanges(record))}</td></tr>`,
    )
    .join("");
  return `<div class="panel"><h2>Audit trail</h2>
    <p class="muted">Newest first. Every accepted settings write appends one row; a rejected write writes nothing.</p>
    <table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Changed</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

export interface SettingsRenderOptions {
  readonly saved?: boolean;
  readonly submitted?: URLSearchParams;
  readonly rendered?: ReadonlySet<string>;
  readonly fieldErrors?: ReadonlyMap<string, string>;
  readonly formError?: string;
  readonly history?: readonly AuditEventRecord[];
  /** A successful directory read turns channel/role ids into pickers. */
  readonly directory?: GuildDirectory;
  /** Why the pickers are off; the ids stay editable as text. */
  readonly directoryError?: string;
}

export function renderSettingsEditor(
  username: string,
  guild: DiscordGuild,
  module: DashboardModule,
  form: SettingsFormModel,
  csrfToken: string,
  options: SettingsRenderOptions = {},
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}`;
  const action = `${base}/settings/${encodePathSegment(module.id)}`;
  const notice = options.saved
    ? `<div class="notice">Settings saved. The change is in the audit trail below.</div>`
    : "";
  const formError = options.formError
    ? `<div class="form-error">${escapeHtml(options.formError)}</div>`
    : "";
  const hasReferences = form.fields.some((field) => field.reference);
  const pickerNote = !hasReferences || options.directory
    ? ""
    : options.directoryError
      ? `<p class="muted">Channel and role pickers are off this load: ${escapeHtml(options.directoryError)} The ids below stay editable as text; the <a href="${base}/directory">Directory</a> page lists the right ones.</p>`
      : `<p class="muted">This process cannot read the server directory, so channel and role ids are text fields. The <a href="${base}/directory">Directory</a> page lists the ids when a bot token is configured.</p>`;
  const lastChange = options.history?.[0];
  const enabledPill = module.enabled
    ? `<span class="pill ok">Enabled</span>`
    : `<span class="pill off">Off</span>`;
  const toggle = `<form method="post" action="${base}/modules/${encodePathSegment(module.id)}/toggle" style="margin:0">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <input type="hidden" name="enabled" value="${module.enabled ? "0" : "1"}">
    <button class="btn small" type="submit">${module.enabled ? "Disable module" : "Enable module"}</button>
  </form>`;

  return renderShell(
    {
      title: `${module.name} settings`,
      eyebrow: guild.name,
      lede: module.description,
      username,
      csrfToken,
      guild,
      section: "settings",
      head: true,
      actions: `<a class="btn small" href="${base}#modules">All modules</a>${toggle}`,
    },
    `${notice}${formError}
     <div class="facts">
       <span class="fact"><span class="dot ${module.enabled ? "ok" : "warn"}"></span>${enabledPill}</span>
       <span class="fact">version <b>${escapeHtml(module.version)}</b></span>
       <span class="fact"><b>${form.fields.length}</b> fields</span>
       <span class="fact"><b>${module.commandCount}</b> command${module.commandCount === 1 ? "" : "s"}</span>
       <span class="fact">Last change <b>${lastChange ? escapeHtml(timestamp(lastChange.createdAt)) : "none recorded"}</b></span>
     </div>
     <section class="card">
       <div class="card-head">
         <div><h2>Settings</h2><p>Generated from this module's Zod schema. Saving applies immediately and appends one audit row; there is no draft state to forget.</p></div>
       </div>
       ${pickerNote}
       <form method="post" action="${action}">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <input type="hidden" name="__rendered" value="${escapeHtml(form.rendered.join(","))}">
         ${form.groups.map((group) => renderGroup(group, options.submitted, options.rendered, options.fieldErrors, options.directory)).join("")}
         <div class="form-actions">
           <button class="btn primary" type="submit">Save settings</button>
           <span class="hint">Invalid input is rejected by the same schema the bot uses, before anything is stored.</span>
         </div>
       </form>
     </section>
     ${renderAudit(options.history ?? [])}`,
  );
}

export interface ApiTokenRenderOptions {
  readonly issued?: { readonly secret: string; readonly record: ApiTokenRecord };
  readonly revoked?: boolean;
}

function tokenStatus(record: ApiTokenRecord): string {
  if (record.revokedAt) return "revoked";
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return "expired";
  return "active";
}

export function renderApiTokens(
  username: string,
  guild: DiscordGuild,
  tokens: readonly ApiTokenRecord[],
  csrfToken: string,
  options: ApiTokenRenderOptions = {},
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}`;
  const issued = options.issued
    ? `<div class="notice">Token <strong>${escapeHtml(options.issued.record.name)}</strong> created. Copy it now; this is the only time it is shown.</div>
       <pre>${escapeHtml(options.issued.secret)}</pre>
       <p class="muted">Only its SHA-256 hash is stored. A lost token must be revoked and reissued.</p>`
    : "";
  const revoked = options.revoked
    ? `<div class="notice">Token revoked. Requests using it now return 401.</div>`
    : "";
  const rows = tokens
    .map((token) => {
      const status = tokenStatus(token);
      return `<tr>
        <td>${escapeHtml(token.name)}</td>
        <td>${token.scopes.map((scope) => `<code>${escapeHtml(scope)}</code>`).join(" ")}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(token.lastUsedAt ?? "never")}</td>
        <td>${escapeHtml(token.expiresAt ?? "never")}</td>
        <td>${
          status === "active"
            ? `<form method="post" action="${base}/tokens/${encodePathSegment(token.id)}/revoke"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit">Revoke</button></form>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");
  return layout(
    "API tokens",
    `<p><a href="${base}">← Back to ${escapeHtml(guild.name)}</a></p>
     <h1>API tokens</h1>
     <p class="muted">Tokens are scoped to <strong>${escapeHtml(guild.name)}</strong> and a subset of three API scopes. The secret is shown once; only a SHA-256 hash is stored. Revocation takes effect on the next request.</p>
     ${issued}${revoked}
     <div class="panel"><h2>Create a token</h2>
       <form method="post" action="${base}/tokens">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="token-name">Name</label><input id="token-name" name="name" type="text" maxlength="80" required></div>
         <fieldset><legend>Scopes</legend>
           <div class="field check"><input id="scope-guild" name="scope" type="checkbox" value="guild:read" checked><label for="scope-guild">guild:read — guild list, overview and module settings</label></div>
           <div class="field check"><input id="scope-analytics" name="scope" type="checkbox" value="analytics:read"><label for="scope-analytics">analytics:read — bounded analytics aggregates</label></div>
           <div class="field check"><input id="scope-settings" name="scope" type="checkbox" value="settings:write"><label for="scope-settings">settings:write — module settings PATCH</label></div>
         </fieldset>
         <div class="field"><label for="token-days">Lifetime (days)</label><input id="token-days" name="expiresInDays" type="number" min="1" max="365" value="30" required><small>1–365 days.</small></div>
         <p><button type="submit">Create token</button></p>
       </form>
     </div>
     <div class="panel"><h2>Issued tokens</h2>
       ${tokens.length === 0 ? `<p class="muted">No tokens have been issued for this server.</p>` : `<table><thead><tr><th>Name</th><th>Scopes</th><th>Status</th><th>Last used</th><th>Expires</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
     </div>`,
    username,
    guildLayout(guild, "tokens", csrfToken),
  );
}

export interface WebhookRenderOptions {
  readonly issued?: { readonly subscription: WebhookSubscription; readonly secret: string };
  readonly deleted?: boolean;
  readonly tested?: boolean;
}

export function renderWebhooks(
  username: string,
  guild: DiscordGuild,
  subscriptions: readonly WebhookSubscription[],
  deliveries: readonly WebhookDelivery[],
  csrfToken: string,
  options: WebhookRenderOptions = {},
): string {
  const guildBase = `/dashboard/guilds/${encodePathSegment(guild.id)}`;
  const base = `${guildBase}/webhooks`;
  const notice = options.issued
    ? `<div class="notice">Signing secret for <strong>${escapeHtml(options.issued.subscription.url)}</strong>. Copy it now; it is stored sealed and shown once.</div>
       <pre>${escapeHtml(options.issued.secret)}</pre>
       <p class="muted">Every delivery carries <code>X-Keystone-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> over <code>t.body</code>. Reject an old timestamp and compare the HMAC before trusting the body.</p>`
    : "";
  const deleted = options.deleted
    ? `<div class="notice">Subscription removed together with its delivery receipts.</div>`
    : "";
  const tested = options.tested
    ? `<div class="notice">A test delivery was queued. Its result appears in the receipts below.</div>`
    : "";

  const rows = subscriptions
    .map(
      (subscription) => `<tr>
        <td><code>${escapeHtml(subscription.url)}</code></td>
        <td>${subscription.events.map((event) => `<code>${escapeHtml(event)}</code>`).join(" ")}</td>
        <td>${escapeHtml(subscription.createdAt)}</td>
        <td>
          <form method="post" action="${base}/${encodePathSegment(subscription.id)}/test"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit">Send test</button></form>
          <form method="post" action="${base}/${encodePathSegment(subscription.id)}/delete"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit">Remove</button></form>
        </td>
      </tr>`,
    )
    .join("");

  const receipts = deliveries
    .map(
      (delivery) => `<tr>
        <td>${escapeHtml(delivery.event)}</td>
        <td>${escapeHtml(delivery.status)}</td>
        <td>${delivery.attempts}</td>
        <td>${delivery.lastStatus === undefined ? "—" : delivery.lastStatus}</td>
        <td>${delivery.lastError ? escapeHtml(delivery.lastError.slice(0, 120)) : "—"}</td>
        <td>${escapeHtml(delivery.createdAt)}</td>
      </tr>`,
    )
    .join("");

  return layout(
    "Webhooks",
    `<p><a href="${guildBase}">← Back to ${escapeHtml(guild.name)}</a></p>
     <h1>Webhooks</h1>
     <p class="muted">Keystone signs each delivery with this subscription's secret. A delivery is queued in an outbox before the request, retried with backoff up to three attempts, and its final receipt stays here.</p>
     ${notice}${deleted}${tested}
     <div class="panel"><h2>Add a subscription</h2>
       <form method="post" action="${base}">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="webhook-url">Endpoint URL</label><input id="webhook-url" name="url" type="url" maxlength="2048" placeholder="https://example.com/keystone" required><small>HTTPS; plain http is accepted only for localhost.</small></div>
         <fieldset><legend>Events</legend>
           ${WEBHOOK_EVENTS.map(
             (event) => `<div class="field check"><input id="event-${event.replaceAll(".", "-")}" name="event" type="checkbox" value="${event}" checked><label for="event-${event.replaceAll(".", "-")}">${event}</label></div>`,
           ).join("")}
         </fieldset>
         <p><button type="submit">Add subscription</button></p>
       </form>
     </div>
     <div class="panel"><h2>Subscriptions</h2>
       ${subscriptions.length === 0 ? `<p class="muted">No webhook endpoints are configured for this server.</p>` : `<table><thead><tr><th>Endpoint</th><th>Events</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
     </div>
     <div class="panel"><h2>Delivery receipts</h2>
       ${deliveries.length === 0 ? `<p class="muted">No delivery has been attempted yet.</p>` : `<table><thead><tr><th>Event</th><th>State</th><th>Attempts</th><th>HTTP</th><th>Last error</th><th>Queued</th></tr></thead><tbody>${receipts}</tbody></table>`}
     </div>`,
    username,
    guildLayout(guild, "webhooks", csrfToken),
  );
}

export interface InstanceView {
  readonly databaseMode: "memory" | "postgres";
  readonly oauthConfigured: boolean;
  readonly secureCookies: boolean;
  readonly sessionTtlMs: number;
  readonly rotationIntervalMs: number;
  readonly idleTimeoutMs: number;
  readonly owners: readonly string[];
  readonly rateLimits: RateLimitPolicies;
}

function duration(value: number): string {
  const seconds = Math.round(value / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

export function renderInstance(
  username: string,
  view: InstanceView,
  csrfToken: string,
  revoked?: number,
): string {
  const owners =
    view.owners.length === 0
      ? `<p class="muted">No owners are configured. Set <code>WEB_OWNER_IDS</code> and restart the web process.</p>`
      : `<ul>${view.owners.map((owner) => `<li><code>${escapeHtml(owner)}</code></li>`).join("")}</ul>`;
  const limits = (Object.keys(view.rateLimits) as Array<keyof RateLimitPolicies>)
    .map((id) => {
      const policy = view.rateLimits[id];
      return `<tr><td>${escapeHtml(id)}</td><td>${policy.max}</td><td>${duration(policy.windowMs)}</td></tr>`;
    })
    .join("");
  const notice =
    revoked === undefined
      ? ""
      : `<div class="notice">Signed out ${revoked} dashboard session(s) for that user id.</div>`;
  return layout(
    "Instance",
    `<p><a href="/">← Back to Keystone</a></p>
     <h1>Instance</h1>
     <p class="muted">Deployment-wide facts and actions. This page is limited to the Discord user ids in <code>WEB_OWNER_IDS</code>; managing one server is not instance ownership.</p>
     ${notice}
     <div class="panel"><h2>Deployment</h2>
       <table><tbody>
         <tr><th>Database</th><td>${escapeHtml(view.databaseMode)}</td></tr>
         <tr><th>Discord OAuth</th><td>${view.oauthConfigured ? "configured" : "not configured"}</td></tr>
         <tr><th>Secure cookies</th><td>${view.secureCookies ? "yes" : "no (local HTTP)"}</td></tr>
         <tr><th>Session lifetime</th><td>${duration(view.sessionTtlMs)} absolute</td></tr>
         <tr><th>Session idle timeout</th><td>${view.idleTimeoutMs > 0 ? `${duration(view.idleTimeoutMs)} without a request` : "disabled"}</td></tr>
         <tr><th>Session rotation</th><td>${view.rotationIntervalMs > 0 ? `every ${duration(view.rotationIntervalMs)} on a page load` : "disabled"}</td></tr>
       </tbody></table>
     </div>
     <div class="panel"><h2>Owners</h2>${owners}</div>
     <div class="panel"><h2>Rate limits</h2>
       <p class="muted">Fixed window per identity: a signed-in user, or the client address for anonymous routes. <code>/healthz</code> is exempt.</p>
       <table><thead><tr><th>Route class</th><th>Requests</th><th>Window</th></tr></thead><tbody>${limits}</tbody></table>
     </div>
     <div class="panel"><h2>End a user's sessions</h2>
       <p class="muted">Deletes every dashboard session row for the Discord user id and clears their cookies on the next request. Their Discord grant is untouched.</p>
       <form method="post" action="/dashboard/instance/sessions/revoke">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <div class="field"><label for="userId">Discord user id</label><input id="userId" name="userId" type="text" inputmode="numeric" autocomplete="off" required></div>
         <p><button type="submit">Sign out every session</button></p>
       </form>
     </div>`,
    username,
  );
}

export function renderActivity(
  username: string,
  guild: DiscordGuild,
  records: readonly AuditEventRecord[],
  csrfToken: string,
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}`;
  const rows = records
    .map((record) => {
      const data =
        record.data && typeof record.data === "object" && !Array.isArray(record.data)
          ? (record.data as Record<string, unknown>)
          : {};
      const moduleId = typeof data.moduleId === "string" ? data.moduleId : undefined;
      const target = moduleId ?? record.targetId ?? "—";
      const link = moduleId && /^[a-z][a-z0-9-]{1,31}$/.test(moduleId)
        ? `<a href="${base}/settings/${encodePathSegment(moduleId)}"><code>${escapeHtml(moduleId)}</code></a>`
        : `<code>${escapeHtml(target)}</code>`;
      return `<tr>
        <td class="nowrap">${escapeHtml(timestamp(record.createdAt, true))}</td>
        <td><code>${escapeHtml(record.actorId ?? "system")}</code></td>
        <td>${escapeHtml(auditAction(record))}</td>
        <td>${link}</td>
        <td class="muted">${escapeHtml(clip(auditChanges(record), 80))}</td>
      </tr>`;
    })
    .join("");
  const latest = records[0];
  return renderShell(
    {
      title: "Activity",
      eyebrow: guild.name,
      lede: "Every accepted write, newest first. A rejected write leaves no row, so this is the honest record of what changed.",
      username,
      csrfToken,
      guild,
      section: "activity",
      head: true,
      actions: `<a class="btn small" href="${base}/activity">Refresh</a>`,
    },
    `<div class="facts">
       <span class="fact"><span class="dot brand"></span><b>${records.length}</b> recent row${records.length === 1 ? "" : "s"}</span>
       <span class="fact">Latest <b>${latest ? escapeHtml(timestamp(latest.createdAt)) : "none"}</b></span>
       <span class="fact">Scope <code>${escapeHtml(guild.id)}</code></span>
     </div>
     ${
       records.length === 0
         ? `<div class="empty"><strong>No writes recorded for this server yet.</strong>
             Open a module, save a setting, and the first row appears here with your Discord id and the exact paths that changed.
             <a href="${base}#modules">Open the module catalog</a>.</div>`
         : `<div class="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Module</th><th>Changed</th></tr></thead><tbody>${rows}</tbody></table></div>`
     }
     <section class="card" style="margin-top:16px">
       <div class="card-head"><div><h2>What writes a row</h2><p>Settings changes, config imports, saved-template writes and API token issue/revoke. Reads never write.</p></div></div>
       <div class="tool-grid">
         <a class="tool" href="${base}/config/drift"><b>Config import</b><span>One row per accepted module write, bound to a preview fingerprint.</span></a>
         <a class="tool" href="${base}/templates"><b>Templates</b><span>Create, update and delete rows carry the dashboard actor.</span></a>
         <a class="tool" href="${base}/tokens"><b>API tokens</b><span>Issue and revoke are audited; the secret itself never is.</span></a>
       </div>
     </section>`,
  );
}

function channelKindLabel(kind: DirectoryChannel["kind"]): string {
  if (kind === "text") return "#";
  if (kind === "voice") return "voice";
  if (kind === "announcement") return "announce";
  if (kind === "stage") return "stage";
  if (kind === "forum") return "forum";
  if (kind === "media") return "media";
  if (kind === "category") return "category";
  return "other";
}

function channelRow(channel: DirectoryChannel): string {
  return `<div class="channel-row">
    <span class="pill">${escapeHtml(channelKindLabel(channel.kind))}</span>
    <span>${escapeHtml(channel.name)}</span>
    <code class="id">${escapeHtml(channel.id)}</code>
  </div>`;
}

function roleColor(color: number): string {
  if (!Number.isInteger(color) || color <= 0) return "var(--line)";
  return `#${color.toString(16).padStart(6, "0")}`;
}

function roleRow(role: DirectoryRole): string {
  const tags = [
    role.managed ? `<span class="pill">managed</span>` : "",
    role.hoist ? `<span class="pill">hoisted</span>` : "",
  ].join("");
  return `<div class="channel-row">
    <span class="role-dot" style="background:${roleColor(role.color)}" aria-hidden="true"></span>
    <span>${escapeHtml(role.name)}</span>
    ${tags}
    <code class="id">${escapeHtml(role.id)}</code>
  </div>`;
}

export interface DirectoryRenderState {
  readonly directory?: GuildDirectory;
  /** A reason the read failed; never a stack trace. */
  readonly error?: string;
}

export function renderDirectory(
  username: string,
  guild: DiscordGuild,
  csrfToken: string,
  state: DirectoryRenderState,
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/directory`;
  const directory = state.directory;
  const categories = directory?.channels.filter((channel) => channel.kind === "category") ?? [];
  const uncategorized = directory
    ? directory.channels.filter(
        (channel) => channel.kind !== "category" && (channel.parentId === null || !categories.some((category) => category.id === channel.parentId)),
      )
    : [];
  const channelGroups = directory
    ? [
        uncategorized.length > 0
          ? `<div class="channel-group"><h3>Uncategorised</h3>${uncategorized
              .map((channel) => channelRow(channel))
              .join("")}</div>`
          : "",
        ...categories.map((category) => {
          const children = directory.channels.filter(
            (channel) => channel.kind !== "category" && channel.parentId === category.id,
          );
          return `<div class="channel-group"><h3>${escapeHtml(category.name)} <code>${escapeHtml(category.id)}</code></h3>${
            children.length > 0
              ? children.map((channel) => channelRow(channel)).join("")
              : `<p class="small muted">No channels in this category.</p>`
          }</div>`;
        }),
      ].join("")
    : "";

  const body = state.error
    ? `<div class="form-error"><strong>The directory could not be read.</strong>${escapeHtml(state.error)}</div>
       <div class="empty"><a href="${base}">Try again</a>. Nothing on this page changes a setting; you can keep using the rest of the dashboard.</div>`
    : directory
      ? `<div class="facts">
           <span class="fact"><span class="dot ok"></span><b>${directory.channels.length}</b> channels</span>
           <span class="fact"><b>${categories.length}</b> categories</span>
           <span class="fact"><b>${directory.roles.length}</b> roles</span>
           <span class="fact">Read <b>${escapeHtml(timestamp(directory.fetchedAt))}</b></span>
         </div>
         <div class="grid two">
           <section class="card">
             <div class="card-head"><div><h2>Channels</h2><p>Grouped by category and read with the bot token. The ids are the values settings fields expect.</p></div></div>
             ${directory.channels.length === 0 ? `<div class="empty">No channels are visible to the bot. Check View Channels.</div>` : channelGroups}
           </section>
           <section class="card">
             <div class="card-head"><div><h2>Roles</h2><p>Hierarchy order. Managed roles belong to bots or integrations and cannot be assigned.</p></div></div>
             ${directory.roles.length === 0 ? `<div class="empty">No roles were returned.</div>` : directory.roles.map((role) => roleRow(role)).join("")}
           </section>
         </div>
         <div class="card">
           <h2>How to use an id</h2>
           <p class="small muted" style="margin-top:6px">Paste it into the matching settings field, for example a logging channel or a welcome role. Pickers that fill these fields are the next pass on the <a href="/dashboard">web roadmap</a>; this page stays read-only.</p>
         </div>`
      : `<div class="empty"><strong>Directory reads are off.</strong>
           This web process started without a bot token, so it cannot read channels or roles. Set <code>DISCORD_TOKEN</code> and restart the dashboard; the rest of the dashboard still works.</div>`;

  return renderShell(
    {
      title: "Channels & roles",
      eyebrow: guild.name,
      lede: "The server as Discord sees it, with the ids settings use. Read-only; no Developer Mode required.",
      username,
      csrfToken,
      guild,
      section: "directory",
      head: true,
      actions: `<a class="btn small" href="${base}">Refresh</a>`,
    },
    body,
  );
}

export interface MusicDashboardView {
  readonly state?: MusicControlState;
  /** The durable row, read directly; it exists even when no bot is reporting. */
  readonly queue?: MusicQueue;
  readonly available: boolean;
  /** False when the bot is online but its last player report is older than 20s. */
  readonly fresh?: boolean;
  readonly enabled: boolean;
  readonly channels: readonly DirectoryChannel[];
  readonly notice?: { readonly kind: "ok" | "error"; readonly text: string };
  readonly unavailableReason?: string;
}

function ago(at: string | undefined): string {
  if (!at) return "never";
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function clock(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The music page is a remote, not a second player. Every control is one POST
 * through Redis to the bot that owns voice; the page renders only state the bot
 * reported, including the node's last position. With no bus it says exactly
 * which process is missing instead of showing a dead button.
 */
export function renderMusic(
  username: string,
  guild: DiscordGuild,
  csrfToken: string,
  view: MusicDashboardView,
): string {
  const base = `/dashboard/guilds/${encodePathSegment(guild.id)}/music`;
  const control = `${base}/control`;
  const player = view.state?.player;
  const track = player?.track;
  const queue = view.queue?.tracks ?? view.state?.queue.tracks ?? [];
  const live = view.available && (view.fresh ?? true);
  // Idle is a terminal state: the bot stops reporting it, so age alone is not
  // evidence that it is wrong. Playing and paused reports are live claims.
  const stale =
    view.available &&
    !live &&
    view.state?.player !== undefined &&
    view.state.player.state !== "idle";
  const voiceChannels = view.channels.filter(
    (channel) => channel.kind === "voice" || channel.kind === "stage",
  );
  const textChannels = view.channels.filter(
    (channel) => channel.kind === "text" || channel.kind === "announcement",
  );
  const statePill = !view.available
    ? `<span class="pill danger">bot not reporting</span>`
    : stale
      ? `<span class="pill warn">last report ${escapeHtml(ago(view.state?.reportedAt))}</span>`
      : !player
        ? `<span class="pill warn">idle</span>`
        : player.state === "playing"
          ? `<span class="pill ok">playing</span>`
          : player.state === "paused"
            ? `<span class="pill warn">paused</span>`
            : `<span class="pill off">${escapeHtml(player.state)}</span>`;

  const form = (
    action: string,
    label: string,
    options: { readonly value?: string | number; readonly variant?: "primary" | "secondary" } = {},
  ): string => `<form method="post" action="${control}" class="music-action">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <input type="hidden" name="action" value="${escapeHtml(action)}">
    ${options.value === undefined ? "" : `<input type="hidden" name="value" value="${escapeHtml(String(options.value))}">`}
    <button type="submit" class="btn small${options.variant === "primary" ? " primary" : ""}">${escapeHtml(label)}</button>
  </form>`;

  const now = live && player && track && player.state !== "idle" ? { player, track } : undefined;
  const nextLoop: MusicLoopMode =
    player?.loop === "off" ? "track" : player?.loop === "track" ? "queue" : "off";
  const controls = now
    ? `<div class="music-controls">
        ${form("pause", now.player.state === "paused" ? "▶ Resume" : "⏸ Pause", {
          variant: "primary",
          ...(now.player.state === "paused" ? { value: "false" } : {}),
        })}
        ${form("skip", "⏭ Skip")}
        ${form("shuffle", "🔀 Shuffle")}
        ${form("loop", `🔁 Loop ${nextLoop}`, { value: nextLoop })}
        ${form("stop", "⏹ Stop")}
      </div>
      <div class="music-controls">
        ${form("volume", "🔉 −10", { value: Math.max(0, now.player.volume - 10) })}
        ${form("volume", "🔊 +10", { value: Math.min(200, now.player.volume + 10) })}
        <span class="small faint">Volume ${now.player.volume}% · loop ${escapeHtml(now.player.loop)} · ${queue.length} queued</span>
      </div>`
    : stale
      ? `<p class="muted small">Controls are disabled because this is the last state the bot reported. Resume starts the durable queue from its head; Play appends a new track.</p>`
      : `<p class="muted small">No track is playing. Choose a voice channel and paste an http(s) audio URL to start.</p>`;

  const percent =
    track?.durationMs && player && track.durationMs > 0
      ? Math.min(100, Math.max(0, Math.round((player.positionMs / track.durationMs) * 100)))
      : 0;
  const duration = track?.isStream ? "LIVE" : clock(track?.durationMs);
  const staleNotice = stale
    ? `<div class="notice"><strong>Last known state, not live.</strong>The bot is online, but its last player report was ${escapeHtml(ago(view.state?.reportedAt))}. The queue below is the durable row; a restart resumes from its head, not from this position.</div>`
    : "";
  const stage = `${staleNotice}<div class="music-stage">
    <div class="music-art"${track?.artworkUrl && /^https:\/\//.test(track.artworkUrl) ? ` style="background-image:url('${escapeHtml(track.artworkUrl)}')"` : ""} role="img" aria-label="${track ? escapeHtml(track.title) : "No artwork"}">
      ${track?.artworkUrl ? "" : `<span aria-hidden="true">♪</span>`}
    </div>
    <section class="card music-now">
      <div class="music-eyebrow">${track ? (stale ? "Last known" : "Now playing") : "Player"} ${statePill}</div>
      <h2 class="music-title">${track ? escapeHtml(track.title) : "Nothing playing"}</h2>
      <p class="music-artist">${track?.artist ? escapeHtml(track.artist) : "The bot's voice session is the source of every value on this page."}</p>
      <div class="music-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Track progress">
        <span style="width:${percent}%"></span>
      </div>
      <div class="music-time"><span>${clock(player?.positionMs)}</span><span>${duration}</span></div>
      ${controls}
      <div class="facts" style="margin:14px 0 0">
        <span class="fact"><span class="dot ${view.state?.node.available ? "ok" : "warn"}"></span>Node <b>${escapeHtml(view.state?.node.name ?? "unknown")}</b>${view.state?.node.version ? ` · ${escapeHtml(view.state.node.version)}` : ""}</span>
        ${view.state?.node.pingMs === undefined ? "" : `<span class="fact">${view.state.node.pingMs}ms</span>`}
        ${player?.voiceChannelId ? `<span class="fact">Voice <b>&lt;#${escapeHtml(player.voiceChannelId)}&gt;</b></span>` : ""}
        <span class="fact">Reported <b>${view.state ? escapeHtml(timestamp(new Date(view.state.reportedAt))) : "never"}</b></span>
      </div>
    </section>
  </div>`;

  const savedQueue = queue.length > 0 && !now;
  const selectedVoice = player?.voiceChannelId;
  const selectedText = player?.textChannelId;
  const defaultText = selectedText ?? textChannels[0]?.id;
  const startForm = `<section class="card music-start">
    <div class="card-head"><div><h2>Start or resume</h2><p>The bot joins the voice channel you choose and posts its signed player card in the text channel.</p></div>${statePill}</div>
    ${
      !view.available || !view.enabled || voiceChannels.length === 0
        ? `<div class="notice">${
            !view.available
              ? "Dashboard control needs the bot and the web process to share REDIS_URL. The page is read-only until the bot reports."
              : !view.enabled
                ? "Music is disabled in this server. Enable it in Module settings before starting a player."
                : "No voice channel is visible. Set DISCORD_TOKEN on the web process so this page can read the server's channels."
          }</div>`
        : `<form method="post" action="${control}" class="music-start-form">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <label>Voice channel
              <select name="voiceChannelId" required>${voiceChannels
                .map(
                  (channel) =>
                    `<option value="${escapeHtml(channel.id)}"${channel.id === selectedVoice ? " selected" : ""}>${escapeHtml(channel.name)}</option>`,
                )
                .join("")}</select>
            </label>
            <label>Player card channel
              <select name="textChannelId"><option value=""${defaultText === undefined ? " selected" : ""}>None</option>${textChannels
                .map(
                  (channel) =>
                    `<option value="${escapeHtml(channel.id)}"${channel.id === defaultText ? " selected" : ""}>${escapeHtml(channel.name)}</option>`,
                )
                .join("")}</select>
            </label>
            <label class="grow">http(s) audio URL
              <input type="url" name="query" placeholder="https://example.com/audio.mp3" maxlength="2048" autocomplete="off">
            </label>
            <button type="submit" name="action" value="play" class="btn primary">▶ Play</button>
            ${
              savedQueue
                ? `<button type="submit" name="action" value="resume" class="btn small">↻ Resume saved queue</button>`
                : ""
            }
          </form>
          <p class="small faint">Resume starts the durable queue from its head; it does not return to the previous second. Choose None for the card channel to play without posting a card.</p>`
    }
  </section>`;

  const queueTable =
    queue.length === 0
      ? `<div class="empty"><strong>The queue is empty.</strong>Add a URL above, or use <code>/music add</code> in Discord. The queue survives a bot restart; a restart resumes from the head, not from the old second.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Track</th><th>Length</th><th>Asked by</th><th></th></tr></thead>
          <tbody>${queue
            .map(
              (entry, index) => `<tr${index === 0 && now ? ' class="queue-current"' : ""}>
                <td>${index + 1}${index === 0 && now ? ` <span class="pill brand">now</span>` : ""}</td>
                <td><strong>${escapeHtml(entry.title)}</strong>${entry.artist ? `<br><span class="faint small">${escapeHtml(entry.artist)}</span>` : ""}</td>
                <td>${escapeHtml(entry.isStream ? "LIVE" : clock(entry.durationMs))}</td>
                <td><code>${escapeHtml(entry.requestedBy)}</code></td>
                <td>${form("remove", "Remove", { value: index + 1 })}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table></div>`;

  const notice = view.notice
    ? `<div class="${view.notice.kind === "ok" ? "notice" : "form-error"}">${escapeHtml(view.notice.text)}</div>`
    : "";

  const body = `${notice}
    ${
      view.available
        ? stage
        : `<div class="form-error"><strong>No bot is reporting.</strong>${escapeHtml(view.unavailableReason ?? "The dashboard needs REDIS_URL, and the bot must be running with the same Redis, to control playback. Nothing here can start audio by itself; no command was sent.")}</div>
           <div class="empty"><strong>The page is honest about it.</strong>Set <code>REDIS_URL</code> on both processes, start the bot, then reload. You can still read the bot's player state here when it reports.</div>`
    }
    ${startForm}
    <section class="card" style="margin-top:16px">
      <div class="card-head"><div><h2>Queue</h2><p>The same durable row the commands read; the current track is position 1 and is removed only when it ends or is skipped.</p></div><span class="pill">${queue.length} track${queue.length === 1 ? "" : "s"}</span></div>
      ${queueTable}
    </section>
    <p class="small faint">Every accepted control is a signed, audited session write in the web process and one Redis request to the bot. The browser never holds a Discord token. Position is the node's last report, not a browser timer.</p>`;

  return renderShell(
    {
      title: "Music",
      eyebrow: guild.name,
      lede: "One Lavalink player, one durable queue and one signed card. Start and control the same session from the dashboard or from /music.",
      username,
      csrfToken,
      guild,
      section: "music",
      head: true,
      actions: `<a class="btn small" href="${base}">Refresh</a>`,
    },
    body,
  );
}

export function renderError(
  title: string,
  message: string,
  session?: { readonly username?: string; readonly csrfToken?: string; readonly owner?: boolean },
): string {
  return layout(
    title,
    `<div class="page-head"><div><div class="eyebrow">Keystone</div><h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(message)}</p></div></div>
     <p><a href="/">Back to Keystone</a></p>`,
    session?.username,
    { csrfToken: session?.csrfToken, owner: session?.owner },
  );
}
