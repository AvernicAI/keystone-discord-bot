import { canonicalJson } from "./canonical";
import { snapshotCounts, type GuildSnapshot, type SnapshotCounts } from "./types";

export interface SettingChange {
  readonly module: string;
  readonly key: string;
  readonly kind: "added" | "changed" | "removed";
}

export interface SnapshotDiff {
  readonly current: SnapshotCounts;
  readonly incoming: SnapshotCounts;
  readonly settings: {
    readonly added: number;
    readonly changed: number;
    readonly removed: number;
    readonly changes: readonly SettingChange[];
  };
  readonly warnings: readonly string[];
}

function settingKey(module: string, key: string): string {
  return `${module}\u0000${key}`;
}

/**
 * A dry run has to be useful, not just say "valid". This reports counts and the
 * exact setting keys that move, capped so a 5,000-row diff does not become an
 * unreadable novel.
 */
export function diffSnapshots(
  current: GuildSnapshot,
  incoming: GuildSnapshot,
  options: { maxChanges?: number } = {},
): SnapshotDiff {
  const maxChanges = options.maxChanges ?? 50;
  const before = new Map(
    current.settings.map((row) => [settingKey(row.module, row.key), row.value]),
  );
  const after = new Map(
    incoming.settings.map((row) => [settingKey(row.module, row.key), row.value]),
  );

  const changes: SettingChange[] = [];
  let added = 0;
  let changed = 0;
  let removed = 0;

  for (const [compound, value] of after) {
    const [module, key] = compound.split("\u0000") as [string, string];
    if (!before.has(compound)) {
      added += 1;
      if (changes.length < maxChanges) changes.push({ module, key, kind: "added" });
      continue;
    }
    if (canonicalJson(before.get(compound)) !== canonicalJson(value)) {
      changed += 1;
      if (changes.length < maxChanges) changes.push({ module, key, kind: "changed" });
    }
  }
  for (const compound of before.keys()) {
    if (after.has(compound)) continue;
    const [module, key] = compound.split("\u0000") as [string, string];
    removed += 1;
    if (changes.length < maxChanges) changes.push({ module, key, kind: "removed" });
  }

  const warnings: string[] = [];
  if (incoming.guild.id !== current.guild.id) {
    warnings.push(
      `Bundle was exported from guild ${incoming.guild.id} and is being restored into ${current.guild.id}.`,
    );
  }
  if (incoming.cases.some((row) => row.caseNumber < 1)) {
    warnings.push("Some cases have an invalid case number and will be rejected by the schema.");
  }
  if (incoming.levels.some((row) => row.level !== Math.floor(row.xp / 100))) {
    warnings.push(
      "Some imported levels do not match Keystone's curve (level = floor(xp / 100)); restore keeps the stored level, file imports recompute it.",
    );
  }

  return {
    current: snapshotCounts(current),
    incoming: snapshotCounts(incoming),
    settings: { added, changed, removed, changes },
    warnings,
  };
}
