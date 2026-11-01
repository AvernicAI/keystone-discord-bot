import type { Guard, GuardResult } from "./types";

/** Commands that touch guild config must never run in a DM. */
export const requireGuild: Guard = (ctx) => {
  if (!ctx.guildId) {
    return { ok: false, message: "This command only works inside a server." };
  }
  return { ok: true };
};

/**
 * Cheapest possible protection against the 10,000-invalid-requests-per-10-min
 * ban: check permissions before calling Discord, never after a 403.
 */
export function requirePermissions(...required: string[]): Guard {
  return (ctx) => {
    const held = new Set(ctx.interaction.permissions);
    if (held.has("Administrator")) return { ok: true };
    const missing = required.filter((permission) => !held.has(permission));
    if (missing.length > 0) {
      return { ok: false, message: `Missing permission: ${missing.join(", ")}` };
    }
    return { ok: true };
  };
}

/**
 * Per-user, per-command cooldown. Since P1 the store is a port: the composition
 * root injects Redis (shared, survives restarts) or the in-memory fallback.
 * The guard itself did not change when that swap happened — that is the point.
 */
export function cooldown(ms: number): Guard {
  return async (ctx) => {
    const key = `${ctx.moduleId}:${[ctx.interaction.commandName, ...ctx.commandPath].join(":")}:${ctx.userId}`;
    const result = await ctx.cooldowns.hit(key, ms, ctx.now());
    if (!result.allowed) {
      const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      return { ok: false, message: `Slow down — try again in ${seconds}s.` };
    }
    return { ok: true };
  };
}

/** Compose guards so a module can declare `guards: all(requireGuild, ...)`. */
export function all(...guards: Guard[]): Guard {
  return async (ctx) => {
    for (const guard of guards) {
      const result: GuardResult = await guard(ctx);
      if (!result.ok) return result;
    }
    return { ok: true };
  };
}
