/**
 * Drift is a report, never a repair.
 *
 * A stored Discord id can point at a deleted channel, a channel the bot can no
 * longer see after obfuscation, a role above the bot, or a resource owned by
 * another guild. Automatically "fixing" any of those would be a surprise write
 * to a server. The dashboard and `/setup` can show this report; an operator
 * decides what to recreate.
 */

export type ResourceKind = "channel" | "role" | "category";

export interface ResourceRef {
  readonly kind: ResourceKind;
  readonly id: string;
  /** `community.welcome.channelId`, so a human can find the setting. */
  readonly path: string;
}

export interface LiveGuildFacts {
  readonly channels: readonly string[];
  readonly roles: readonly string[];
  readonly categories: readonly string[];
  readonly automodRules: readonly string[];
  /** Optional permission facts, keyed by channel id. `false` is a gap. */
  readonly channelPermissions?: Readonly<
    Record<string, Readonly<Record<string, boolean>>>
  >;
}

export interface DriftGap {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly path: string;
  readonly reason: "missing" | "not-visible";
}

export interface PermissionGap {
  readonly channelId: string;
  readonly permission: string;
  readonly path: string;
}

export interface DriftReport {
  readonly refs: number;
  readonly missing: readonly DriftGap[];
  readonly permissionGaps: readonly PermissionGap[];
  readonly expectedAutoModRules: readonly string[];
  readonly missingAutoModRules: readonly string[];
  /** A report is always read-only; this field exists to make that explicit. */
  readonly readOnly: true;
}

const REF_SUFFIXES: ReadonlyArray<[RegExp, ResourceKind]> = [
  [/channelId$/i, "channel"],
  [/roleId$/i, "role"],
  [/categoryId$/i, "category"],
];

/**
 * Collect Discord ids from settings by the naming convention every module
 * already follows. Walking recursively means nested reward/shop arrays are
 * covered without a second registry that drifts from the schemas.
 */
export function collectResourceRefs(
  settings: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ResourceRef[] {
  const refs: ResourceRef[] = [];
  for (const [module, values] of Object.entries(settings)) {
    walk(values, module, refs);
  }
  return refs.sort((a, b) => a.path.localeCompare(b.path));
}

function walk(value: unknown, path: string, refs: ResourceRef[]): void {
  if (typeof value === "string") {
    const key = path.split(".").at(-1) ?? "";
    const match = REF_SUFFIXES.find(([suffix]) => suffix.test(key));
    if (match && value.length > 0 && !value.startsWith("{")) {
      refs.push({ kind: match[1], id: value, path });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, refs));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, `${path}.${key}`, refs);
    }
  }
}

export function computeDrift(
  refs: readonly ResourceRef[],
  live: LiveGuildFacts,
  expectedAutoModRules: readonly string[] = [],
): DriftReport {
  const visible = {
    channel: new Set(live.channels),
    role: new Set(live.roles),
    category: new Set(live.categories),
  };
  const missing: DriftGap[] = [];
  for (const ref of refs) {
    if (visible[ref.kind].has(ref.id)) continue;
    missing.push({
      kind: ref.kind,
      id: ref.id,
      path: ref.path,
      // Obfuscation deliberately makes "deleted" and "not visible" the same
      // answer over HTTP. Name the ambiguity instead of guessing.
      reason: "missing",
    });
  }

  const permissionGaps: PermissionGap[] = [];
  for (const [channelId, permissions] of Object.entries(live.channelPermissions ?? {})) {
    for (const [permission, granted] of Object.entries(permissions)) {
      if (granted) continue;
      const ref = refs.find((row) => row.id === channelId);
      permissionGaps.push({
        channelId,
        permission,
        path: ref?.path ?? `channel:${channelId}`,
      });
    }
  }

  const presentRules = new Set(live.automodRules);
  return {
    refs: refs.length,
    missing,
    permissionGaps,
    expectedAutoModRules: [...expectedAutoModRules],
    missingAutoModRules: expectedAutoModRules.filter((rule) => !presentRules.has(rule)),
    readOnly: true,
  };
}
