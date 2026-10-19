// Test-only helpers: an in-process Postgres (PGlite + pgvector) with the real
// migrations applied, so tests exercise actual SQL without a running server.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./client";
import * as schema from "./schema";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function createTestDb() {
  const client = new PGlite({ extensions: { vector } });
  const pgliteDb = drizzle({ client, schema, casing: "snake_case" });
  await migrate(pgliteDb, { migrationsFolder: MIGRATIONS });
  // Same query-builder API as the node-postgres Database; only the driver differs.
  const db = pgliteDb as unknown as Database;
  return {
    db,
    /** Empties every table (keeps the schema). */
    reset: () =>
      pgliteDb.execute(sql`
        truncate table llm_calls, questions, promise_checks, promises, chunks,
          document_pages, filings, watchlist_items, companies,
          verification, account, session, "user"
        restart identity cascade`),
    close: () => client.close(),
  };
}
