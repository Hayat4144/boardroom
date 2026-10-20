import type { Request, RequestHandler } from "express";
import { httpError } from "../http";
import { getSessionUser, type SessionUser } from "./auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's documented augmentation point
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const signInRequired = () => httpError(401, "unauthorized", "Sign in required");

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const user = await getSessionUser(req);
  if (!user) throw signInRequired();

  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const user = currentUser(req);
  if (user.role !== "admin") throw httpError(403, "forbidden", "Admin only");

  next();
};

/** The signed-in user; only call behind requireAuth. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw signInRequired();

  return req.user;
}
