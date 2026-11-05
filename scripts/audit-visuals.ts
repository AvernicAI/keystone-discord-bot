/**
 * `pnpm audit:visuals` — make the visual mission measurable.
 *
 * The mission says the weakest screen is always the next pass. That only works
 * if "weak" is computable, so this script owns four rules:
 *
 * 1. Coverage: every file that builds a Components V2 layout has a row in
 *    `memory/machine/surfaces.json`. A new panel cannot ship invisible.
 * 2. Evidence: a criterion graded A needs a live proof (probe, mcp, gateway)
 *    with a date and a footer, so an A is a claim someone can check.
 * 3. Palette: a file marked `tokens: "enforced"` may not contain a raw
 *    `0xRRGGBB`; the accent must come from `@keystone/ui`.
 * 4. Focus: the run always prints the weakest surface and its next fix, which
 *    is the brief for the next pass even when every check passes.
 *
 * It grades nothing itself. Taste stays in the rubric and in review; the script
 * only proves the ledger is complete, current and self-consistent.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const CRITERIA = ["structure", "density", "honesty", "freshness", "action", "copy"] as const;
const GRADES = { A: 4, B: 3, C: 2, D: 1, F: 0 } as const;
const PROOF_CLASSES = new Set(["probe", "mcp", "gateway"]);

type Criterion = (typeof CRITERIA)[number];
type Grade = keyof typeof GRADES;

interface Surface {
  id: string;
  module: string;
  where: string;
  file: string;
  component: "v2" | "embed";
  grades: Record<Criterion, Grade>;
  hasFooter: boolean;
  tokens: "enforced" | "pending";
  proof: { class: string; date: string; note: string } | null;
  next: string;
}

interface Ledger {
  schemaVersion: number;
  updatedAt: string;
  criteria: string[];
  surfaces: Surface[];
}

const failures: string[] = [];
const checks: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  checks.push(label);
  if (!ok) failures.push(detail);
}

async function readText(relative: string): Promise<string> {
  return readFile(path.join(root, relative), "utf8");
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...(await walk(relative)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(relative);
    }
  }
  return files;
}

function average(surface: Surface): number {
  const total = CRITERIA.reduce((sum, criterion) => sum + GRADES[surface.grades[criterion]], 0);
  return total / CRITERIA.length;
}

function weakest(surfaces: readonly Surface[]): Surface | undefined {
  return [...surfaces].sort((left, right) => average(left) - average(right))[0];
}

const ledger = JSON.parse(await readText("memory/machine/surfaces.json")) as Ledger;

check("ledger schemaVersion is 1", ledger.schemaVersion === 1, "surfaces.json schemaVersion must be 1");
check(
  "ledger updatedAt is a date",
  /^\d{4}-\d{2}-\d{2}$/.test(ledger.updatedAt),
  "surfaces.json updatedAt must be YYYY-MM-DD",
);
check(
  "ledger lists the six criteria",
  CRITERIA.every((criterion) => ledger.criteria.includes(criterion)),
  `surfaces.json criteria must be exactly ${CRITERIA.join(", ")}`,
);
check(
  "ledger has surfaces",
  Array.isArray(ledger.surfaces) && ledger.surfaces.length > 0,
  "surfaces.json lists no surfaces",
);

const ids = new Set<string>();
const files = new Set<string>();
for (const surface of ledger.surfaces) {
  const label = surface.id || "(missing id)";
  check(`${label} has a unique id`, Boolean(surface.id) && !ids.has(surface.id), `${label} repeats or lacks an id`);
  ids.add(surface.id);

  check(
    `${label} names an existing file`,
    Boolean(surface.file) && !files.has(surface.file),
    `${label} repeats a file or omits one`,
  );
  files.add(surface.file);
  try {
    await readText(surface.file);
  } catch {
    failures.push(`${label} points at a file that does not exist: ${surface.file}`);
  }

  check(
    `${label} grades every criterion`,
    CRITERIA.every((criterion) => surface.grades?.[criterion] in GRADES),
    `${label} must grade ${CRITERIA.join(", ")} as A-F`,
  );
  check(
    `${label} names the next fix`,
    typeof surface.next === "string" && surface.next.trim().length > 0,
    `${label} has no next fix, so the mission cannot pick it up`,
  );
  check(
    `${label} declares its component`,
    surface.component === "v2" || surface.component === "embed",
    `${label} must be v2 or embed`,
  );

  const graded = CRITERIA.map((criterion) => surface.grades?.[criterion]);
  const claimsA = graded.includes("A");
  check(
    `${label} has live proof for an A`,
    !claimsA || Boolean(surface.proof),
    `${label} claims an A with no live proof`,
  );
  if (surface.proof) {
    check(
      `${label} names a proof class`,
      PROOF_CLASSES.has(surface.proof.class),
      `${label} proof class must be probe, mcp or gateway`,
    );
    check(
      `${label} dates its proof`,
      /^\d{4}-\d{2}-\d{2}$/.test(surface.proof.date),
      `${label} proof date must be YYYY-MM-DD`,
    );
  }
  check(
    `${label} has a footer for an A`,
    !claimsA || surface.hasFooter,
    `${label} claims an A without a footer line`,
  );

  if (surface.tokens === "enforced") {
    const source = await readText(surface.file);
    check(
      `${label} uses palette tokens`,
      !/0x[0-9a-fA-F]{6}/.test(source),
      `${label} hard-codes a hex colour; import ACCENTS from @keystone/ui`,
    );
  }
}

// Coverage is derived from the code, never from the ledger: a new `layout(`
// call site is exactly the way a surface enters the product.
const scanned = [...(await walk("modules")), ...(await walk("apps/bot/src"))];
const layoutFiles: string[] = [];
for (const file of scanned) {
  if ((await readText(file)).includes("layout(")) layoutFiles.push(file);
}

const covered = new Set(ledger.surfaces.filter((surface) => surface.component === "v2").map((s) => s.file));
for (const file of layoutFiles) {
  check(
    `${file} is in the ledger`,
    covered.has(file),
    `${file} builds a V2 layout but has no surfaces.json row`,
  );
}
for (const file of covered) {
  check(
    `${file} still builds a layout`,
    layoutFiles.includes(file),
    `${file} is a v2 ledger row but no longer calls layout(); update the ledger`,
  );
}

const ordered = [...ledger.surfaces].sort((left, right) => average(right) - average(left));
for (const surface of ordered) {
  const mean = average(surface).toFixed(2);
  console.log(`${mean}  ${surface.id.padEnd(24)} ${surface.component.padEnd(5)} ${surface.file}`);
}
const focus = weakest(ledger.surfaces);
if (focus) {
  console.log("");
  console.log(`weakest surface: ${focus.id} (${average(focus).toFixed(2)}) — ${focus.next}`);
}

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error("");
  console.error(`audit:visuals — ${checks.length} checks, ${failures.length} failed`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log(`audit:visuals — ${checks.length} checks, ${ledger.surfaces.length} surfaces, all green`);
}
