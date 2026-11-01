import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "modules/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
    ],
    environment: "node",
    reporters: ["default"],
    // Tests must never need a Discord token or a live gateway. If a test starts
    // reaching for the network, that is a design bug — move the logic into a
    // pure function instead.
    // PGlite is the real Postgres engine in WASM. Several suites open their own
    // engine, so a full parallel run can exceed the old 10s ceiling on a busy
    // laptop without any single test hanging. This is a scheduler allowance,
    // not a licence to hide a stuck test; a genuinely hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
