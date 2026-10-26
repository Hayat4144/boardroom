import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",

    // PGlite boots an in-process Postgres per test file.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
