// Seeds the cement test companies and one admin user.
// Usage: pnpm seed  (reads SEED_ADMIN_* and DATABASE_URL from the root .env)
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";

import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "../client";
import { account, companies, user } from "../schema";

import { SEED_COMPANIES } from "./companies";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);

  return value;
}

// Upserts on nse_symbol, so running it again updates rows instead of duplicating them.
export async function seedCompanies(db: Database) {
  const rows = await db
    .insert(companies)
    .values([...SEED_COMPANIES])
    .onConflictDoUpdate({
      target: companies.nseSymbol,
      set: {
        name: sql`excluded.name`,
        bseCode: sql`excluded.bse_code`,
        sector: sql`excluded.sector`,
      },
    })
    // xmax = 0 only for rows this statement inserted (updated rows carry our xid).
    .returning({ nseSymbol: companies.nseSymbol, inserted: sql<boolean>`(xmax = 0)` });

  for (const row of rows) {
    console.log(`${row.inserted ? "inserted" : "updated"}: ${row.nseSymbol}`);
  }

  const inserted = rows.filter((row) => row.inserted).length;
  console.log(
    `companies: ${rows.length} seeded (${inserted} inserted, ${rows.length - inserted} updated)`,
  );
}

async function seedAdmin(db: Database) {
  const email = requireEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");

  const [existing] = await db.select().from(user).where(eq(user.email, email));

  if (existing) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, existing.id));
    console.log(`admin: ${email} already exists, ensured role=admin (password unchanged)`);
    return;
  }

  // Mirrors what Better Auth's email/password sign-up writes: a user row plus a
  // "credential" account holding the hashed password.
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id: userId, name, email, emailVerified: true, role: "admin" });

    await tx.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",

      userId,
      password: passwordHash,
    });
  });

  console.log(`admin: created ${email}`);
}

async function main() {
  const { db, pool } = createDb(requireEnv("DATABASE_URL"));

  try {
    await seedCompanies(db);
    await seedAdmin(db);
  } finally {
    await pool.end();
  }
}

// Only run when executed directly, so tests can import seedCompanies.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
