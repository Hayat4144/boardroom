import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { companies, user, type Database, type UserRole } from "@boardroom/db";
import { vi } from "vitest";
import { createApp } from "../src/app";
import type { SessionUser } from "../src/auth/middleware";
import type { AppDeps } from "../src/routes/deps";
import { ObjectNotFoundError, type Storage } from "../src/services/storage";

/** In-memory Storage; nothing touches S3 or disk. */
export function memoryStorage() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const storage: Storage = {
    async put(key, body, contentType) {
      const buf = Buffer.isBuffer(body)
        ? body
        : body instanceof Uint8Array
          ? Buffer.from(body)
          : Buffer.concat(await body.toArray());
      objects.set(key, { body: buf, contentType });
    },
    async getStream(key) {
      const obj = objects.get(key);
      if (!obj) throw new ObjectNotFoundError(key);
      return Readable.from([obj.body]);
    },
    async delete(key) {
      objects.delete(key);
    },
    async getPresignedUrl(key, expiresInSeconds = 300) {
      return `https://s3.test/${key}?X-Amz-Expires=${expiresInSeconds}`;
    },
  };
  return { storage, objects };
}

export async function createUser(db: Database, role: UserRole = "user"): Promise<SessionUser> {
  const id = randomUUID();
  const u = { id, email: `${role}-${id.slice(0, 8)}@test.dev`, name: `Test ${role}`, role };
  await db.insert(user).values(u);
  return u;
}

export async function createCompany(db: Database, name = "Infosys Ltd") {
  const [c] = await db
    .insert(companies)
    .values({
      name,
      nseSymbol: name.slice(0, 4).toUpperCase(),
      bseCode: String(Math.random()).slice(2, 8),
    })
    .returning();
  return c!;
}

/**
 * The real Express app with test doubles: sessions come from an `x-test-user`
 * header (instead of Better Auth cookies), storage is in-memory, jobs are spies.
 */
export function buildApp(db: Database, users: SessionUser[], overrides: Partial<AppDeps> = {}) {
  const { storage, objects } = memoryStorage();
  const jobs = { enqueueExtractPromises: vi.fn(async () => "job-1") };
  const app = createApp({
    db,
    storage,
    jobs,
    getSessionUser: async (req) => users.find((u) => u.id === req.header("x-test-user")) ?? null,
    webOrigin: "http://localhost:5173",
    askDailyLimit: 20,
    ...overrides,
  });
  return { app, storage, objects, jobs };
}
