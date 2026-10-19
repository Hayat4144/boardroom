import { createDb, type Database } from "@boardroom/db";
import { getEnv } from "./config/env";

let instance: ReturnType<typeof createDb> | undefined;

/** Shared Drizzle instance for the API process (routes, jobs, HAYAT code). */
export function getDb(): Database {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance.db;
}

export async function closeDb() {
  await instance?.pool.end();
  instance = undefined;
}
