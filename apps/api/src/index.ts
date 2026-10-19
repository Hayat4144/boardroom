import { toNodeHandler } from "better-auth/node";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { betterAuthSessionUser } from "./auth/session";
import { getEnv } from "./config/env";
import { closeDb, getDb } from "./db";
import { startJobs } from "./jobs";
import { createStorageFromEnv } from "./services/storage";

async function main() {
  const env = getEnv();
  const db = getDb();
  const auth = createAuth(db, env);
  const jobs = await startJobs(env.DATABASE_URL, db);

  const app = createApp({
    db,
    storage: createStorageFromEnv(env),
    jobs,
    getSessionUser: betterAuthSessionUser(auth),
    authHandler: toNodeHandler(auth),
    webOrigin: env.WEB_ORIGIN,
    askDailyLimit: env.ASK_DAILY_LIMIT,
  });

  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await jobs.stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
