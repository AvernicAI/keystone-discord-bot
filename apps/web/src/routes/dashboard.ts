import { authorizeGuild, requireSession, requireSettingsWrite } from "../authorization";
import { encodePathSegment, parseFormSettings, redirect, send, type FormSettings } from "../http";
import { renderGuildList, renderOverview, renderSettingsEditor } from "../render";
import type { RouteContext } from "../request-context";

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
  send(ctx.res, 200, renderOverview(session.username, view, ctx.csrfToken), "text/html; charset=utf-8", {
    "Cache-Control": "no-store",
  });
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
    const module = await ctx.deps.dashboard.module(guild, moduleId);
    send(
      ctx.res,
      200,
      renderSettingsEditor(session.username, guild, module, ctx.csrfToken),
      "text/html; charset=utf-8",
      { "Cache-Control": "no-store" },
    );
    return true;
  }

  if (ctx.method === "POST") {
    // The form carries its CSRF token in the body, so parsing is part of the
    // token read. The gate still runs session -> guild auth -> CSRF in order.
    let form!: FormSettings;
    const write = await requireSettingsWrite(ctx.deps, ctx.session, guildId, async () => {
      form = await parseFormSettings(ctx.req);
      return form.csrf;
    });
    await ctx.deps.dashboard.update(write.guild, moduleId, form.patch);
    redirect(ctx.res, `/dashboard/guilds/${encodePathSegment(guildId)}`);
    return true;
  }

  // Preserve the existing authorization-before-fallthrough behavior for an
  // unsupported method on an existing settings path.
  await authorizeGuild(ctx.deps, ctx.session, guildId);
  return false;
}
