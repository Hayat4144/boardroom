import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs with cwd = packages/db; env lives at the repo root.
const envFile = resolve(process.cwd(), "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env at the repo root)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
