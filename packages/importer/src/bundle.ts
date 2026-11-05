import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "./canonical";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  GuildSnapshotSchema,
  INCLUDED,
  MAX_BUNDLE_BYTES,
  OMITTED,
  snapshotCounts,
  type GuildSnapshot,
  type SnapshotCounts,
} from "./types";

export const BundleManifestSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  generator: z.string().min(1),
  createdAt: z.string().min(1),
  guildId: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  counts: z.object({
    settings: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    caseEvents: z.number().int().nonnegative(),
    tickets: z.number().int().nonnegative(),
    forms: z.number().int().nonnegative(),
    formSubmissions: z.number().int().nonnegative(),
    levels: z.number().int().nonnegative(),
    xpEvents: z.number().int().nonnegative(),
    economyLedger: z.number().int().nonnegative(),
    auditEvents: z.number().int().nonnegative(),
    communityRecords: z.number().int().nonnegative(),
    aiDocuments: z.number().int().nonnegative(),
    aiUsage: z.number().int().nonnegative(),
    casesUnique: z.number().int().nonnegative(),
    formsUnique: z.number().int().nonnegative(),
    levelsUnique: z.number().int().nonnegative(),
  }),
  includes: z.array(z.string()),
  omits: z.array(z.string()),
});
export type BundleManifest = z.infer<typeof BundleManifestSchema>;

export const ExportBundleSchema = z.object({
  manifest: BundleManifestSchema,
  snapshot: GuildSnapshotSchema,
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export function checksumSnapshot(snapshot: GuildSnapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

/** Build a bundle and stamp it with a checksum over the snapshot content. */
export function createBundle(
  snapshot: GuildSnapshot,
  options: { generator?: string; now?: string } = {},
): ExportBundle {
  const counts = snapshotCounts(snapshot);
  return {
    manifest: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      generator: options.generator ?? "keystone",
      createdAt: options.now ?? new Date().toISOString(),
      guildId: snapshot.guild.id,
      checksum: checksumSnapshot(snapshot),
      counts,
      includes: [...INCLUDED],
      omits: [...OMITTED],
    },
    snapshot,
  };
}

export function serializeBundle(bundle: ExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export class BundleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unsupported-version"
      | "checksum"
      | "guild-mismatch"
      | "counts"
      | "too-large"
      | "schema",
  ) {
    super(message);
    this.name = "BundleError";
  }
}

/**
 * Parse and verify before the first write. A corrupt bundle is a refusal, not a
 * partially restored guild.
 */
export function parseBundle(text: string): ExportBundle {
  if (Buffer.byteLength(text, "utf8") > MAX_BUNDLE_BYTES) {
    throw new BundleError(
      `Bundle is larger than the ${MAX_BUNDLE_BYTES / 1024 / 1024} MB limit.`,
      "too-large",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new BundleError(
      `Bundle is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "schema",
    );
  }

  if (isRecord(raw) && isRecord(raw.manifest) && raw.manifest.version !== EXPORT_VERSION) {
    throw new BundleError(
      `Bundle version ${String(raw.manifest.version)} is not supported; this build reads version ${EXPORT_VERSION}.`,
      "unsupported-version",
    );
  }

  const parsed = ExportBundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BundleError(
      `Bundle schema is invalid: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ")}`,
      "schema",
    );
  }

  const bundle = parsed.data;
  const actual = checksumSnapshot(bundle.snapshot);
  if (actual !== bundle.manifest.checksum) {
    throw new BundleError("Bundle checksum does not match its contents; it was edited or corrupted.", "checksum");
  }
  if (bundle.snapshot.guild.id !== bundle.manifest.guildId) {
    throw new BundleError("Bundle manifest guild does not match the snapshot.", "guild-mismatch");
  }

  const counts = snapshotCounts(bundle.snapshot);
  for (const [key, value] of Object.entries(counts)) {
    const claimed = bundle.manifest.counts[key as keyof SnapshotCounts];
    if (claimed !== value) {
      throw new BundleError(
        `Bundle manifest count for ${key} is ${claimed}, but the snapshot has ${value}.`,
        "counts",
      );
    }
  }

  return bundle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
