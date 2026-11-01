#!/usr/bin/env node
/**
 * `pnpm pass:end` — the end-of-pass ritual.
 *
 * It creates the next journal entry from a template and prints the checklist
 * that keeps memory honest. It deliberately does NOT fill anything in: a human
 * (or an agent) has to say what was tried and rejected. Auto-generated memory
 * teaches nobody.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const journalDir = path.join(root, "memory/journal");
const today = new Date().toISOString().slice(0, 10);
const force = process.argv.includes("--force");

const existing = existsSync(journalDir)
  ? (await readdir(journalDir)).filter((f) => f.startsWith(today) && f.endsWith(".md"))
  : [];

const pass = String(existing.length + 1).padStart(2, "0");
const file = path.join(journalDir, `${today}-pass-${pass}.md`);

const template = `---
date: ${today}
pass: ${pass}
phase: P0
author:
status: in-progress
---

# Pass ${pass} — ${today}

## What changed
<!-- One bullet per change. Link the module or ADR. -->

## What we tried and rejected
<!-- The most valuable section. What did you consider, why did it lose? -->

## Verification
<!-- Exact commands run and their result. Never write "tests pass" without the command. -->

## Next
<!-- The single next action, plus anything now blocked. -->
`;

if (existsSync(file) && !force) {
  console.log(`memory: ${path.relative(root, file)} already exists (use --force to overwrite)`);
} else {
  await mkdir(journalDir, { recursive: true });
  await writeFile(file, template, "utf8");
  console.log(`memory: created ${path.relative(root, file)}`);
}

console.log(`
End-of-pass checklist
  [ ] Journal filled in — especially "tried and rejected"
  [ ] Module Status.md updated ("Now", "Verified", "Next")
  [ ] memory/machine/project.json updated (phase, metrics, statuses, lastPass)
  [ ] pnpm memory:check
  [ ] pnpm check

The pass is not done until all five are green. That is the whole discipline:
memory that lags the code is a lie, and lies compound.
`);
