import {
  authorizeFleet,
  authorizeGuild,
  requireSession,
  requireSessionWrite,
  requireSettingsWrite,
} from "../authorization";
import { HttpError } from "../http-error";
import { ConfigBundleError, type ConfigBundle } from "../config-bundle";
import {
  encodePathSegment,
  parseBody,
  parseConfigUpload,
  parseSettingsFormBody,
  redirect,
  send,
  type ConfigUpload,
  type SettingsFormBody,
} from "../http";
import {
  renderActivity,
  renderAnalytics,
  renderConfigDrift,
  renderDirectory,
  renderConfigPreview,
  renderFleet,
  renderGuildList,
  renderMusic,
  renderOverview,
  renderSavedTemplateEditor,
  renderSavedTemplates,
  renderSettingsEditor,
  renderTemplatePreview,
} from "../render";
import { analyticsDays } from "../overview";
import type { RouteContext } from "../request-context";
import { SettingsValidationError, parseSettingsForm } from "../settings-form";
import { DirectoryError, type DirectoryChannel } from "../directory";
import { CONFIG_TEMPLATES, findTemplate } from "../templates";
import type { MusicControlAction } from "@keystone/kernel";

const MAX_FLEET_GUILDS = 25;

interface FleetSelection {
  readonly templateId: string;
  readonly guildIds: readonly string[];
}

function readGuildIds(params: URLSearchParams): readonly string[] {
  const guildIds = [
    ...new Set(
      params
        .getAll("guild")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (guildIds.length === 0) {
    throw new HttpError(400, "Select at least one guild.", "guilds_missing");
  }
  if (guildIds.length > MAX_FLEET_GUILDS) {
    throw new HttpError(400, `Select at most ${MAX_FLEET_GUILDS} guilds at once.`, "guilds_too_many");
  }
  for (const guildId of guildIds) {
    if (!/^\d{15,20}$/.test(guildId)) {
      throw new HttpError(400, "One selected guild id is invalid.", "guild_invalid");
    }
  }
  return guildIds;
}

function readFleetSelection(params: URLSearchParams): FleetSelection {
  const templateId = (params.get("template") ?? "").trim();
  if (!templateId) throw new HttpError(400, "Choose a template.", "template_missing");
  return { templateId, guildIds: readGuildIds(params) };
}

function count(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function fleet(ctx: RouteContext): Promise<boolean> {
  const active = requireSession(ctx.session);
  const guilds = await ctx.deps.access.manageableGuilds(ctx.deps.auth.accessToken(active));
  const view = await ctx.deps.dashboard.fleet(guilds);
  send(
    ctx.res,
    200,
    renderFleet(active.username, view, CONFIG_TEMPLATES, ctx.csrfToken, {
      applied: count(ctx.url.searchParams.get("applied")),
      failed: count(ctx.url.searchParams.get("failed")),
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function fleetPreview(ctx: RouteContext): Promise<boolean> {
  let params!: URLSearchParams;
  const active = await requireSessionWrite(ctx.deps, ctx.session, async () => {
    params = new URLSearchParams(await parseBody(ctx.req));
    return params.get("csrf") ?? undefined;
  });

  const selection = readFleetSelection(params);
  const template = findTemplate(selection.templateId);
  if (!template) throw new HttpError(404, "No such template.", "template_not_found");
  const guilds = await authorizeFleet(ctx.deps, active, selection.guildIds);
  const plan = await ctx.deps.dashboard.previewTemplate(guilds, template);

  send(
    ctx.res,
    200,
    renderTemplatePreview(active.username, plan, ctx.csrfToken),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function fleetApply(ctx: RouteContext): Promise<boolean> {
  let params!: URLSearchParams;
  const active = await requireSessionWrite(ctx.deps, ctx.session, async () => {
    params = new URLSearchParams(await parseBody(ctx.req));
    return params.get("csrf") ?? undefined;
  });

  const selection = readFleetSelection(params);
  const fingerprint = (params.get("fingerprint") ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new HttpError(
      400,
      "The preview fingerprint is missing. Preview the template before applying it.",
      "preview_missing",
    );
  }
  const template = findTemplate(selection.templateId);
  if (!template) throw new HttpError(404, "No such template.", "template_not_found");
  const guilds = await authorizeFleet(ctx.deps, active, selection.guildIds);

  const result = await ctx.deps.dashboard.applyTemplate(guilds, template, fingerprint, active.userId);
  for (const failure of result.failures) {
    ctx.deps.logger.warn("fleet template write failed", failure);
  }
  redirect(ctx.res, `/dashboard/fleet?applied=${result.modulesWritten}&failed=${result.failures.length}`);
  return true;
}

export async function configExport(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const bundle = await ctx.deps.dashboard.exportConfig(guild);
  send(ctx.res, 200, `${JSON.stringify(bundle, null, 2)}\n`, "application/json; charset=utf-8", {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="keystone-config-${guild.id}.json"`,
  });
  return true;
}

export async function configDriftPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const drift = await ctx.deps.dashboard.configDrift(guild);
  send(
    ctx.res,
    200,
    renderConfigDrift(session.username, guild, drift, ctx.csrfToken, {
      imported: count(ctx.url.searchParams.get("imported")),
      failed: count(ctx.url.searchParams.get("failed")),
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function configImportPreview(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  let upload!: ConfigUpload;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    upload = await parseConfigUpload(ctx.req);
    return upload.csrf;
  });
  if (!upload.text.trim()) {
    throw new HttpError(400, "Choose a config file to import.", "config_file_missing");
  }

  let bundle: ConfigBundle;
  try {
    bundle = ctx.deps.dashboard.parseConfig(upload.text);
  } catch (error) {
    if (!(error instanceof ConfigBundleError)) throw error;
    const drift = await ctx.deps.dashboard.configDrift(write.guild);
    send(
      ctx.res,
      400,
      renderConfigDrift(write.session.username, write.guild, drift, ctx.csrfToken, {
        importError: error.message,
      }),
      "text/html; charset=utf-8",
      { "Cache-Control": "no-store" },
    );
    return true;
  }

  const plan = await ctx.deps.dashboard.previewConfigImport(write.guild, bundle);
  send(
    ctx.res,
    200,
    renderConfigPreview(write.session.username, plan, upload.text, ctx.csrfToken),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function configImportApply(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  let upload!: ConfigUpload;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    upload = await parseConfigUpload(ctx.req);
    return upload.csrf;
  });
  if (!upload.text.trim()) {
    throw new HttpError(400, "Choose a config file to import.", "config_file_missing");
  }

  const fingerprint = (upload.fields.get("fingerprint") ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new HttpError(
      400,
      "The preview fingerprint is missing. Preview the config before applying it.",
      "preview_missing",
    );
  }

  const bundle = ctx.deps.dashboard.parseConfig(upload.text);
  const result = await ctx.deps.dashboard.applyConfigImport(
    write.guild,
    bundle,
    fingerprint,
    write.session.userId,
  );
  for (const failure of result.failures) {
    ctx.deps.logger.warn("config import write failed", {
      guildId: write.guild.id,
      moduleId: failure.moduleId,
      message: failure.message,
    });
  }
  redirect(
    ctx.res,
    `/dashboard/guilds/${encodePathSegment(guildId)}/config/drift?imported=${result.modulesWritten}&failed=${result.failures.length}`,
  );
  return true;
}

export async function templatesPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const templates = await ctx.deps.dashboard.listSavedTemplates(guild);
  send(
    ctx.res,
    200,
    renderSavedTemplates(session.username, guild, templates, ctx.csrfToken, {
      created: ctx.url.searchParams.get("created") === "1",
      deleted: ctx.url.searchParams.get("deleted") === "1",
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function templateCreate(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  const template = await ctx.deps.dashboard.createSavedTemplate(
    write.guild,
    {
      name: body.get("name") ?? "",
      description: body.get("description") ?? "",
    },
    write.session.userId,
  );
  redirect(
    ctx.res,
    `/dashboard/guilds/${encodePathSegment(guildId)}/templates/${encodePathSegment(template.id)}?created=1`,
  );
  return true;
}

export async function templateEditorPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const templateId = params[1] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const [template, targets, history] = await Promise.all([
    ctx.deps.dashboard.savedTemplate(guild, templateId),
    ctx.deps.access.manageableGuilds(ctx.deps.auth.accessToken(session)),
    ctx.deps.dashboard.history(guild.id, { targetId: templateId, limit: 12 }),
  ]);
  send(
    ctx.res,
    200,
    renderSavedTemplateEditor(session.username, guild, template, targets, ctx.csrfToken, {
      created: ctx.url.searchParams.get("created") === "1",
      updated: ctx.url.searchParams.get("saved") === "1",
      applied: count(ctx.url.searchParams.get("applied")),
      failed: count(ctx.url.searchParams.get("failed")),
      history,
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function templateUpdate(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const templateId = params[1] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  await ctx.deps.dashboard.updateSavedTemplate(
    write.guild,
    templateId,
    {
      name: body.get("name") ?? "",
      description: body.get("description") ?? "",
      refreshSettings: body.get("refresh") === "1",
    },
    write.session.userId,
  );
  redirect(
    ctx.res,
    `/dashboard/guilds/${encodePathSegment(guildId)}/templates/${encodePathSegment(templateId)}?saved=1`,
  );
  return true;
}

export async function templateDelete(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const templateId = params[1] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  await ctx.deps.dashboard.deleteSavedTemplate(write.guild, templateId, write.session.userId);
  redirect(ctx.res, `/dashboard/guilds/${encodePathSegment(guildId)}/templates?deleted=1`);
  return true;
}

export async function templatePreview(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const templateId = params[1] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  const targets = await authorizeFleet(ctx.deps, write.session, readGuildIds(body));
  const template = await ctx.deps.dashboard.savedTemplateRecord(write.guild, templateId);
  const plan = await ctx.deps.dashboard.previewSavedTemplate(targets, template);
  send(
    ctx.res,
    200,
    renderTemplatePreview(write.session.username, plan, ctx.csrfToken, {
      applyAction: `/dashboard/guilds/${encodePathSegment(guildId)}/templates/${encodePathSegment(templateId)}/apply`,
      includeTemplateField: false,
      backHref: `/dashboard/guilds/${encodePathSegment(guildId)}/templates/${encodePathSegment(templateId)}`,
      backLabel: "Back to the template",
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function templateApply(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const templateId = params[1] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  const fingerprint = (body.get("fingerprint") ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new HttpError(
      400,
      "The preview fingerprint is missing. Preview the saved template before applying it.",
      "preview_missing",
    );
  }
  const targets = await authorizeFleet(ctx.deps, write.session, readGuildIds(body));
  const template = await ctx.deps.dashboard.savedTemplateRecord(write.guild, templateId);
  const result = await ctx.deps.dashboard.applySavedTemplate(
    targets,
    template,
    fingerprint,
    write.session.userId,
  );
  for (const failure of result.failures) {
    ctx.deps.logger.warn("saved template write failed", failure);
  }
  redirect(
    ctx.res,
    `/dashboard/guilds/${encodePathSegment(guildId)}/templates/${encodePathSegment(templateId)}?applied=${result.modulesWritten}&failed=${result.failures.length}`,
  );
  return true;
}

export async function dashboardList(ctx: RouteContext): Promise<boolean> {
  const active = requireSession(ctx.session);
  const guilds = await ctx.deps.access.manageableGuilds(ctx.deps.auth.accessToken(active));
  send(ctx.res, 200, renderGuildList(active.username, guilds, ctx.csrfToken), "text/html; charset=utf-8", {
    "Cache-Control": "no-store",
  });
  return true;
}

export async function guildOverview(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const view = await ctx.deps.dashboard.view(guild);
  const readiness = await ctx.deps.dashboard.readiness(guild, view);
  const toggled = ctx.url.searchParams.get("toggled") ?? undefined;
  send(
    ctx.res,
    200,
    renderOverview(session.username, view, ctx.csrfToken, {
      readiness,
      ...(toggled
        ? {
            toggle: {
              moduleId: toggled,
              state: ctx.url.searchParams.get("state") === "on" ? ("on" as const) : ("off" as const),
            },
          }
        : {}),
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

const MUSIC_ACTIONS: readonly MusicControlAction[] = [
  "play",
  "resume",
  "pause",
  "skip",
  "stop",
  "shuffle",
  "loop",
  "volume",
  "remove",
];

function heartbeatFresh(at: string | undefined): boolean {
  if (!at) return false;
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) && Date.now() - parsed < 20_000;
}

/**
 * The music remote. The page reads a bot-published state and a 15-second
 * heartbeat; it never reads the queue directly, because the bot owns which
 * track is current. Every write is a control request, not a second player.
 */
export async function musicPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const editor = await ctx.deps.dashboard.editor(guild, "music");

  let channels: readonly DirectoryChannel[] = [];
  if (ctx.deps.directory) {
    try {
      channels = (await ctx.deps.directory.guildResources(guild.id)).channels;
    } catch (error) {
      ctx.deps.logger.warn("music page directory read failed", {
        guildId: guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const state = ctx.deps.music ? await ctx.deps.music.readState(guild.id) : undefined;
  const beat = ctx.deps.music ? await ctx.deps.music.readHeartbeat() : undefined;
  const online = Boolean(ctx.deps.music) && heartbeatFresh(beat);
  let durable = state?.queue;
  if (ctx.deps.musicStore) {
    try {
      durable = await ctx.deps.musicStore.list(guild.id);
    } catch (error) {
      ctx.deps.logger.warn("music page queue read failed", {
        guildId: guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // The heartbeat proves the bot is alive; it does not prove this guild's
  // player state is recent. Presenting a dead session as "playing" after a
  // restart is exactly the kind of fake the page must never show.
  const fresh = state !== undefined && heartbeatFresh(state.reportedAt);
  const ok = ctx.url.searchParams.get("ok");
  const error = ctx.url.searchParams.get("error");

  send(
    ctx.res,
    200,
    renderMusic(session.username, guild, ctx.csrfToken, {
      ...(state ? { state } : {}),
      ...(durable ? { queue: durable } : {}),
      available: online,
      fresh,
      enabled: editor.module.enabled,
      channels,
      ...(ok ? { notice: { kind: "ok" as const, text: ok.slice(0, 300) } } : {}),
      ...(error ? { notice: { kind: "error" as const, text: error.slice(0, 300) } } : {}),
      ...(online
        ? {}
        : {
            unavailableReason: ctx.deps.music
              ? `No heartbeat from the bot in the last 20 seconds${beat ? ` (last seen ${beat})` : ""}. Start the bot with the same REDIS_URL; the music page is read-only until it reports.`
              : "REDIS_URL is not set on this web process, so there is no bus to the bot. Nothing was sent and no player was started.",
          }),
    }),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function musicControl(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  const base = `/dashboard/guilds/${encodePathSegment(guildId)}/music`;
  const action = (body.get("action") ?? "") as MusicControlAction;
  if (!MUSIC_ACTIONS.includes(action)) {
    throw new HttpError(400, "That music control is not supported.", "music_action_invalid");
  }
  if (!ctx.deps.music) {
    throw new HttpError(503, "Dashboard music control needs REDIS_URL on both processes.", "music_bus_unconfigured");
  }

  const query = (body.get("query") ?? "").trim();
  if (query.length > 2_048) {
    throw new HttpError(400, "That URL is longer than 2048 characters.", "music_query_too_long");
  }
  const voiceChannelId = (body.get("voiceChannelId") ?? "").trim();
  const textChannelId = (body.get("textChannelId") ?? "").trim();
  const value = body.get("value") ?? undefined;

  try {
    const reply = await ctx.deps.music.request({
      id: globalThis.crypto.randomUUID(),
      guildId,
      actorId: write.session.userId,
      source: "web",
      action,
      ...(query ? { query } : {}),
      ...(voiceChannelId ? { voiceChannelId } : {}),
      ...(textChannelId ? { textChannelId } : {}),
      ...(value !== undefined ? { value } : {}),
      requestedAt: new Date().toISOString(),
    });
    await ctx.deps.audit.append({
      guildId,
      actorId: write.session.userId,
      action: "music.control",
      targetId: action,
      data: {
        action,
        value,
        ok: reply.ok,
        ...(reply.code ? { code: reply.code } : {}),
        ...(voiceChannelId ? { voiceChannelId } : {}),
      },
    });
    const message = reply.message.slice(0, 240);
    redirect(
      ctx.res,
      `${base}?${reply.ok ? "ok" : "error"}=${encodeURIComponent(message)}`,
    );
  } catch (error) {
    ctx.deps.logger.warn("music control request failed", {
      guildId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    redirect(
      ctx.res,
      `${base}?error=${encodeURIComponent(
        error instanceof Error ? error.message.slice(0, 240) : "The bot did not answer.",
      )}`,
    );
  }
  return true;
}

/**
 * One-click enable/disable. This is the dashboard form of the same
 * `SettingsService.update` path every other surface uses: the module schema
 * validates the patch, one audit row is appended, and the webhook outbox event
 * fires. There is no second settings store.
 */
export async function moduleToggle(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const moduleId = params[1] as string;
  let body!: URLSearchParams;
  const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
    body = new URLSearchParams(await parseBody(ctx.req));
    return body.get("csrf") ?? undefined;
  });
  const value = body.get("enabled");
  if (value !== "0" && value !== "1") {
    throw new HttpError(400, "Choose whether the module should be on or off.", "module_state_invalid");
  }
  const enabled = value === "1";
  await ctx.deps.dashboard.update(
    write.guild,
    moduleId,
    { enabled },
    { actorId: write.session.userId, source: "dashboard" },
  );
  redirect(
    ctx.res,
    `/dashboard/guilds/${encodePathSegment(guildId)}?toggled=${encodePathSegment(moduleId)}&state=${
      enabled ? "on" : "off"
    }#modules`,
  );
  return true;
}

export async function activityPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const records = await ctx.deps.dashboard.activity(guild.id, 50);
  send(
    ctx.res,
    200,
    renderActivity(session.username, guild, records, ctx.csrfToken),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

/**
 * A read-only channel/role directory. It is the answer to Developer Mode: the
 * ids are right there, grouped the way Discord groups them. A failed read is a
 * named message, never an empty list that looks like an empty server.
 */
export async function directoryPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  let state: Parameters<typeof renderDirectory>[3] = {};
  if (!ctx.deps.directory) {
    state = {};
  } else {
    try {
      state = { directory: await ctx.deps.directory.guildResources(guild.id) };
    } catch (error) {
      const message =
        error instanceof DirectoryError
          ? error.message
          : "Discord did not return the server directory. Nothing was changed; try again shortly.";
      if (!(error instanceof DirectoryError) || !error.unavailable) {
        ctx.deps.logger.warn("directory read failed", {
          guildId: guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      state = { error: message };
    }
  }
  send(
    ctx.res,
    200,
    renderDirectory(session.username, guild, ctx.csrfToken, state),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function analyticsPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
  const days = analyticsDays(ctx.url.searchParams.get("days"));
  const snapshot = await ctx.deps.dashboard.analytics(guild, days);
  send(
    ctx.res,
    200,
    renderAnalytics(session.username, guild, snapshot, days, ctx.csrfToken),
    "text/html; charset=utf-8",
    { "Cache-Control": "no-store" },
  );
  return true;
}

export async function settingsPage(
  ctx: RouteContext,
  params: readonly string[],
): Promise<boolean> {
  const guildId = params[0] as string;
  const moduleId = params[1] as string;

  if (ctx.method === "GET") {
    const { session, guild } = await authorizeGuild(ctx.deps, ctx.session, guildId);
    const [{ module, form }, history] = await Promise.all([
      ctx.deps.dashboard.editor(guild, moduleId),
      ctx.deps.dashboard.history(guild.id, { moduleId }),
    ]);
    send(
      ctx.res,
      200,
      renderSettingsEditor(session.username, guild, module, form, ctx.csrfToken, {
        saved: ctx.url.searchParams.get("saved") === "1",
        history,
      }),
      "text/html; charset=utf-8",
      { "Cache-Control": "no-store" },
    );
    return true;
  }

  if (ctx.method === "POST") {
    // The form carries its CSRF token in the body, so parsing is part of the
    // token read. The gate still runs session -> guild auth -> CSRF in order.
    let body!: SettingsFormBody;
    const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
      body = await parseSettingsFormBody(ctx.req);
      return body.csrf;
    });

    const [{ module, form }, history] = await Promise.all([
      ctx.deps.dashboard.editor(write.guild, moduleId),
      ctx.deps.dashboard.history(write.guild.id, { moduleId }),
    ]);
    const parsed = parseSettingsForm(form, body.params);

    if (parsed.errors.size > 0) {
      send(
        ctx.res,
        400,
        renderSettingsEditor(write.session.username, write.guild, module, form, ctx.csrfToken, {
          submitted: body.params,
          rendered: parsed.rendered,
          fieldErrors: parsed.errors,
          formError: "Fix the highlighted fields. Nothing was saved.",
          history,
        }),
        "text/html; charset=utf-8",
        { "Cache-Control": "no-store" },
      );
      return true;
    }

    try {
      await ctx.deps.dashboard.update(write.guild, moduleId, parsed.patch, {
        actorId: write.session.userId,
        source: "dashboard",
      });
    } catch (error) {
      if (!(error instanceof SettingsValidationError)) throw error;
      const fieldErrors = new Map(
        error.issues.map((issue) => [issue.path, issue.message] as const),
      );
      send(
        ctx.res,
        400,
        renderSettingsEditor(write.session.username, write.guild, module, form, ctx.csrfToken, {
          submitted: body.params,
          rendered: parsed.rendered,
          fieldErrors,
          formError: error.message,
          history,
        }),
        "text/html; charset=utf-8",
        { "Cache-Control": "no-store" },
      );
      return true;
    }

    redirect(
      ctx.res,
      `/dashboard/guilds/${encodePathSegment(guildId)}/settings/${encodePathSegment(moduleId)}?saved=1`,
    );
    return true;
  }

  // Preserve the existing authorization-before-fallthrough behavior for an
  // unsupported method on an existing settings path.
  await authorizeGuild(ctx.deps, ctx.session, guildId);
  return false;
}
