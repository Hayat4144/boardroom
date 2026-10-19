// Seeds placeholder companies and one admin user.
// Usage: pnpm db:seed  (reads SEED_ADMIN_* and DATABASE_URL from the root .env)
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { account, companies, user } from "./schema";

// Placeholders until the starting sector is chosen (TASKS.md, Phase 0).
const SEED_COMPANIES = [
  {
    name: "Reliance Industries Ltd",
    bseCode: "500325",
    nseSymbol: "RELIANCE",
    sector: "Conglomerate",
  },
  {
    name: "Tata Consultancy Services Ltd",
    bseCode: "532540",
    nseSymbol: "TCS",
    sector: "IT Services",
  },
  { name: "Infosys Ltd", bseCode: "500209", nseSymbol: "INFY", sector: "IT Services" },
  { name: "HDFC Bank Ltd", bseCode: "500180", nseSymbol: "HDFCBANK", sector: "Banking" },
  { name: "ITC Ltd", bseCode: "500875", nseSymbol: "ITC", sector: "FMCG" },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function seedCompanies(db: ReturnType<typeof createDb>["db"]) {
  const inserted = await db
    .insert(companies)
    .values(SEED_COMPANIES)
    .onConflictDoNothing({ target: companies.bseCode })
    .returning({ id: companies.id });
  console.log(
    `companies: ${inserted.length} inserted, ${SEED_COMPANIES.length - inserted.length} already present`,
  );
}

async function seedAdmin(db: ReturnType<typeof createDb>["db"]) {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
