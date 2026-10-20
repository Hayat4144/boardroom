import { createDb } from "@boardroom/db";
import { env } from "./env";

/** The one Drizzle instance for the API process (routes, jobs, HAYAT code). */
export const { db, pool } = createDb(env.DATABASE_URL);
