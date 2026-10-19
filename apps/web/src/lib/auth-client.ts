import { createAuthClient } from "better-auth/react";
import { API_URL } from "./api";

// Better Auth is mounted on the API at /api/auth; session lives in an httpOnly cookie.
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});
