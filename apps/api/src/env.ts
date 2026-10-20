import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),

  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),

  S3_SECRET_ACCESS_KEY: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),

  // Origin of the web app, allowed for CORS + Better Auth trusted origins.
  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  // Max POST /ask calls per user per 24h (LLM cost control).
  ASK_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates process.env once, listing every problem on failure. */
function readEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  const problems = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment:\n${problems.join("\n")}`);
}

export const env = readEnv();
