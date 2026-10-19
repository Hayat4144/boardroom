import { account, session, user, verification, type Database } from "@boardroom/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../config/env";

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Dev stub: no email provider yet (TASKS.md Phase 6), so log the link.
      sendResetPassword: async ({ user, url }) => {
        console.log(`[auth] password reset for ${user.email}: ${url}`);
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        console.log(`[auth] verify email for ${user.email}: ${url}`);
      },
    },
    user: {
      additionalFields: {
        // Never settable from sign-up; promote users via the DB / seed script.
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
