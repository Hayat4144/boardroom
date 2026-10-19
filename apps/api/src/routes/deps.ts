import type { Database } from "@boardroom/db";
import type { RequestHandler } from "express";
import type { GetSessionUser } from "../auth/middleware";
import type { Jobs } from "../jobs";
import type { Storage } from "../services/storage";

export interface AppDeps {
  db: Database;
  storage: Storage;
  jobs: Pick<Jobs, "enqueueExtractPromises">;
  getSessionUser: GetSessionUser;
  /** Better Auth's Node handler, mounted at /api/auth/*. Omitted in tests. */
  authHandler?: RequestHandler;
  webOrigin: string;
  askDailyLimit: number;
}
