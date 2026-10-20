import { randomUUID } from "node:crypto";
import { companies, user, type UserRole } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { createTestDb } from "@boardroom/db/testing";
import type { Request } from "express";
import type { SessionUser } from "../src/auth/auth";

/**
 * One in-process Postgres per test file (Vitest isolates files). Test files
 * point the app at it with: vi.mock("../src/db", ...).
 */
export const testDb = await createTestDb();

/** Stand-in for Better Auth: the signed-in user is whoever the `x-test-user` header names. */
export async function sessionFromHeader(req: Request): Promise<SessionUser | null> {
  const id = req.header("x-test-user");
  if (!id) return null;

  const [row] = await testDb.db.select().from(user).where(eq(user.id, id));
  return row ? { id: row.id, email: row.email, name: row.name, role: row.role } : null;
}

export const as = (u: SessionUser) => ({ "x-test-user": u.id });

/** In-memory replacement for the S3 functions in src/services/storage.ts. */
export const storedFiles = new Map<string, Buffer>();

export const memoryStorage = {
  uploadFile: async (key: string, body: Buffer) => void storedFiles.set(key, body),
  deleteFile: async (key: string) => void storedFiles.delete(key),
  getFileUrl: async (key: string) => `https://s3.test/${key}`,

  downloadFile: async (key: string) => {
    const file = storedFiles.get(key);
    if (!file) throw new Error(`No such file: ${key}`);

    return file;
  },
};

export async function createUser(role: UserRole = "user"): Promise<SessionUser> {
  const id = randomUUID();
  const newUser = { id, email: `${role}-${id.slice(0, 8)}@test.dev`, name: `Test ${role}`, role };

  await testDb.db.insert(user).values(newUser);
  return newUser;
}

export async function createCompany(name = "Infosys Ltd") {
  const nseSymbol = name.slice(0, 4).toUpperCase();
  const bseCode = String(Math.random()).slice(2, 8);

  const [company] = await testDb.db
    .insert(companies)
    .values({ name, nseSymbol, bseCode })
    .returning();
  return company!;
}
