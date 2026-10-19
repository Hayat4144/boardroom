import type { UserRole } from "@boardroom/db";
import type { Request, RequestHandler } from "express";
import { HttpError } from "../lib/http";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's documented augmentation point
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Resolves the logged-in user from the request's session cookie, or null. */
export type GetSessionUser = (req: Request) => Promise<SessionUser | null>;

export function createRequireAuth(getSessionUser: GetSessionUser): RequestHandler {
  return async (req, _res, next) => {
    const user = await getSessionUser(req);
    if (!user) throw new HttpError(401, "unauthorized", "Sign in required");
    req.user = user;
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, "unauthorized", "Sign in required");
  if (req.user.role !== "admin") throw new HttpError(403, "forbidden", "Admin only");
  next();
};

/** The authenticated user; only call behind requireAuth. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, "unauthorized", "Sign in required");
  return req.user;
}
