#!/usr/bin/env node
/**
 * Validates the machine half of /memory against the vault and the code.
 *
 * Design rule: memory that lies is worse than no memory. So this checks links
 * in BOTH directions — every project.json module must have a folder and docs,
 * and every module folder must be listed. `pnpm check` runs it, so a pass
 * cannot end green with stale memory.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const memoryDir = path.join(root, "memory");
const projectPath = path.join(memoryDir, "machine/project.json");

const errors = [];
const warnings = [];
const checks = [];

function rel(target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function memoryPath(p) {
  return path.join(memoryDir, p);
}

function check(label, ok, detail) {
  checks.push({ label, ok });
  if (!ok) errors.push(detail ?? label);
}

async function readText(file) {
  return readFile(file, "utf8");
}

async function main() {
  if (!existsSync(projectPath)) {
    console.error("memory: machine/project.json is missing");
    process.exit(1);
  }

  const project = JSON.parse(await readText(projectPath));

  // --- top-level shape -----------------------------------------------------
  for (const key of ["schemaVersion", "name", "updatedAt", "phase", "lastPass", "modules", "decisions"]) {
    check(`project.${key} present`, key in project, `machine/project.json is missing "${key}"`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(project.updatedAt ?? "")) {
    errors.push(`project.updatedAt "${project.updatedAt}" is not YYYY-MM-DD`);
  }

  // --- journal -------------------------------------------------------------
  const lastPassFile = memoryPath(project.lastPass ?? "");
  check(
    "last pass journal exists",
    project.lastPass && existsSync(lastPassFile),
    `project.lastPass points at a missing file: ${project.lastPass}`,
  );

  if (existsSync(lastPassFile)) {
    const journal = await readText(lastPassFile);
    for (const heading of ["## What changed", "## What we tried and rejected", "## Verification", "## Next"]) {
      check(
        `journal has "${heading}"`,
        journal.includes(heading),
        `${project.lastPass} is missing the "${heading}" section`,
      );
    }
  }

  const journalDir = path.join(memoryDir, "journal");
  const journals = existsSync(journalDir)
    ? (await readdir(journalDir)).filter((f) => f.endsWith(".md"))
    : [];
  check("journal has at least one entry", journals.length > 0, "memory/journal is empty");

  // --- modules: bidirectional link ----------------------------------------
  const modulesDir = path.join(root, "modules");
  const codeDirs = existsSync(modulesDir)
    ? (await readdir(modulesDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  const listed = new Set();
  for (const mod of project.modules ?? []) {
    const label = `module ${mod.id}`;
    if (!mod.id || !mod.name) {
      errors.push(`${label}: id and name are required`);
      continue;
    }
    listed.add(mod.codePath);

    check(
      `${label}: code exists`,
      mod.codePath && existsSync(path.join(root, mod.codePath)),
      `${label}: codePath missing on disk (${mod.codePath})`,
    );
    check(
      `${label}: spec exists`,
      mod.specPath && existsSync(memoryPath(mod.specPath)),
      `${label}: specPath missing on disk (${mod.specPath})`,
    );
    check(
      `${label}: status exists`,
      mod.statusPath && existsSync(memoryPath(mod.statusPath)),
      `${label}: statusPath missing on disk (${mod.statusPath})`,
    );
    if (mod.teachingPath) {
      check(
        `${label}: teaching doc exists`,
        existsSync(memoryPath(mod.teachingPath)),
        `${label}: teachingPath missing on disk (${mod.teachingPath})`,
      );
    }

    if (existsSync(memoryPath(mod.statusPath ?? ""))) {
      const status = await readText(memoryPath(mod.statusPath));
      check(
        `${label}: status has "## Now"`,
        status.includes("## Now"),
        `${label}: Status.md is missing a "## Now" section`,
      );
    }

    if (existsSync(memoryPath(mod.specPath ?? ""))) {
      const spec = await readText(memoryPath(mod.specPath));
      check(
        `${label}: spec names its commands`,
        (mod.commands ?? []).every((command) => spec.includes(`/${command}`)),
        `${label}: Spec.md does not document every registered command (${(mod.commands ?? []).join(", ")})`,
      );
    }
  }

  for (const dir of codeDirs) {
    check(
      `modules/${dir} is in machine memory`,
      listed.has(`modules/${dir}`),
      `modules/${dir} exists in code but is not listed in memory/machine/project.json`,
    );
  }

  // --- ADRs ----------------------------------------------------------------
  const adrDir = path.join(memoryDir, "vault/03-Architecture/ADR");
  const adrFiles = existsSync(adrDir) ? (await readdir(adrDir)).filter((f) => f.endsWith(".md")) : [];
  check("ADR directory has decisions", adrFiles.length > 0, "no ADRs found");

  for (const file of adrFiles) {
    const text = await readText(path.join(adrDir, file));
    check(
      `ADR ${file} has a Status section`,
      /^## Status/m.test(text),
      `ADR ${file} is missing "## Status"`,
    );
    check(
      `ADR ${file} records rejected alternatives`,
      /^## Alternatives/m.test(text),
      `ADR ${file} is missing "## Alternatives" — the reasoning is the teaching material`,
    );
  }

  // --- command budget consistency -----------------------------------------
  if (project.metrics) {
    check(
      `metrics.commands within Discord's limit`,
      project.metrics.commands <= project.metrics.commandLimit,
      `project.metrics.commands (${project.metrics.commands}) exceeds ${project.metrics.commandLimit}`,
    );
  }

  // --- open questions ------------------------------------------------------
  for (const question of project.openQuestions ?? []) {
    if (question.status === "answered" && !question.answer) {
      errors.push(`${question.id} is marked answered but has no answer`);
    }
  }

  // --- report --------------------------------------------------------------
  const failed = checks.filter((c) => !c.ok);
  const label = `${checks.length - failed.length}/${checks.length} memory checks passed`;

  if (failed.length === 0) {
    console.log(`memory: ${label}`);
    for (const warning of warnings) console.log(`  warning: ${warning}`);
    if (journals.length > 0) console.log(`  latest journal: ${journals.sort().at(-1)}`);
    return;
  }

  console.error(`memory: ${label}\n`);
  for (const failure of errors) console.error(`  x ${failure}`);
  console.error("\nFix the links or update memory/machine/project.json, then re-run `pnpm memory:check`.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("memory-check crashed:", error);
  process.exit(1);
});
