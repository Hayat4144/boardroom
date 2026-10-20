import { account, session, user, verification, type UserRole } from "@boardroom/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { Request } from "express";
import { db } from "../db";
import { env } from "../env";

export const auth = betterAuth({
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

/** Express handler for every /api/auth/* route (sign up, sign in, sign out, session). */
export const authHandler = toNodeHandler(auth);

export type SessionUser = {
  id: string;
  email: string;
  name: string;

  role: UserRole;
};

/** The user behind the request's session cookie, or null when signed out. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!result) return null;

  const { id, email, name, role } = result.user;
  return { id, email, name, role: role === "admin" ? "admin" : "user" };
}
