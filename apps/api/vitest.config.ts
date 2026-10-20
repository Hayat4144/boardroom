import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",

    // PGlite boots an in-process Postgres per test file.
    testTimeout: 20_000,
    hookTimeout: 60_000,

    // Dummy values so src/env.ts validates. Nothing real is reached: tests use
    // PGlite for the database and mock S3, Better Auth, jobs and the LLM.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      LLM_API_KEY: "test-key",
      S3_BUCKET: "test-bucket",

      S3_REGION: "ap-south-1",
      S3_ACCESS_KEY_ID: "AKIATEST",
      S3_SECRET_ACCESS_KEY: "secret",

      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      ASK_DAILY_LIMIT: "2",
    },
  },
});
