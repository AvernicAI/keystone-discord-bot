/**
 * P4 research harness: exact flat cosine at a realistic vector count.
 *
 * This is deliberately not a pgvector benchmark. It measures the portable
 * reference index that runs in CI/PGlite; the pgvector extension comparison is
 * a separate gate and is recorded as open in the research note.
 *
 * Usage: pnpm tsx scripts/benchmark-ai.ts [count] [dimensions] [queries]
 */
import { performance } from "node:perf_hooks";

const count = Math.max(1, Number(process.argv[2] ?? 100_000));
const dimensions = Math.max(8, Number(process.argv[3] ?? 128));
const queries = Math.max(1, Number(process.argv[4] ?? 20));

function vector(seed: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length: dimensions }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  });
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += (a[index] ?? 0) * (b[index] ?? 0);
    left += (a[index] ?? 0) ** 2;
    right += (b[index] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(left) * Math.sqrt(right) || 1);
}

const started = performance.now();
const corpus = Array.from({ length: count }, (_, index) => vector(index + 1));
const built = performance.now();
const latencies: number[] = [];
let checksum = 0;

for (let query = 0; query < queries; query += 1) {
  const probe = vector(9_000_000 + query);
  const before = performance.now();
  let best = -Infinity;
  for (const candidate of corpus) best = Math.max(best, cosine(probe, candidate));
  latencies.push(performance.now() - before);
  checksum += best;
}

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0;
console.log(
  JSON.stringify(
    {
      harness: "exact-flat-cosine",
      vectors: count,
      dimensions,
      queries,
      buildMs: Math.round(built - started),
      p95ScanMs: Math.round(p95 * 100) / 100,
      meanScanMs: Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 100) / 100,
      recall: 1,
      checksum: Math.round(checksum * 1e6) / 1e6,
      note: "Exact scan; pgvector ANN recall/latency is a separate external gate.",
    },
    null,
    2,
  ),
);
