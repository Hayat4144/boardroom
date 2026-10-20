import { app } from "./app";
import { pool } from "./db";
import { env } from "./env";
import { startJobs, stopJobs } from "./jobs/jobs";

await startJobs();

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close();

  await stopJobs();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
