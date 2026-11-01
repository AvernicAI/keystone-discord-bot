import { defineConfig } from "tsup";

/**
 * Production build.
 *
 * Workspace packages are bundled (they are TypeScript source, which Node cannot
 * run directly); third-party packages stay external and are installed in the
 * runtime image. `migrate` is its own entry so the compose `migrate` service can
 * run it once, before the bot and worker start.
 */
export default defineConfig({
  entry: {
    bot: "apps/bot/src/index.ts",
    worker: "apps/worker/src/index.ts",
    migrate: "scripts/migrate.ts",
    portability: "scripts/portability.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // CJS dependencies bundled into an ESM artefact still call `require` for
  // optional and dynamic imports; without this shim Node throws at startup.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // pnpm does not hoist dependencies to the root, so a dist artefact that
  // imports bare package names cannot resolve them from /app/node_modules.
  // Bundle everything; only PGlite (a WASM test dependency, never imported by
  // production entries) stays external.
  noExternal: [/.*/],
  external: ["@electric-sql/pglite"],
});
