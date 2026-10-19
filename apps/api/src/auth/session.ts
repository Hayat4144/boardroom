import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "./auth";
import type { GetSessionUser } from "./middleware";

export function betterAuthSessionUser(auth: Auth): GetSessionUser {
  return async (req) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) return null;
    const { id, email, name, role } = result.user;
    return { id, email, name, role: role === "admin" ? "admin" : "user" };
  };
}
