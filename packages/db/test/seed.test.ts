import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { companies } from "../src/schema";
import { seedCompanies } from "../src/seed/run";

import { createTestDb } from "../src/testing";

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  testDb = await createTestDb();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => testDb.close());

it("is idempotent: seeding twice leaves exactly 6 companies", async () => {
  await seedCompanies(testDb.db);
  await seedCompanies(testDb.db);

  const rows = await testDb.db.select().from(companies);

  expect(rows).toHaveLength(6);
});
