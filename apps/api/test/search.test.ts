import { chunks, filings } from "@boardroom/db";
import { isNull } from "@boardroom/db/orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "../src/services/embeddings";
import { embedFilingChunks, searchChunks } from "../src/services/search";
import { createCompany, testDb } from "./helpers";

vi.mock("../src/db", async () => ({ db: (await import("./helpers")).testDb.db }));

vi.mock("../src/services/embeddings", async () => {
  const { fakeVector } = await import("./helpers");
  return { embedTexts: vi.fn(async (texts: string[]) => texts.map(fakeVector)) };
});

const db = testDb.db;

beforeEach(async () => {
  await testDb.reset();
  vi.clearAllMocks();
});

async function createFiling(companyId: string, fiscalQuarter: number, texts: string[]) {
  const [filing] = await db
    .insert(filings)
    .values({
      companyId,
      source: "manual",
      type: "transcript",

      title: `Q${fiscalQuarter} call`,
      fiscalYear: 27,
      fiscalQuarter,

      filedOn: "2026-11-05",
    })
    .returning();

  const rows = texts.map((content, i) => ({ filingId: filing!.id, pageNumber: i + 1, content }));
  await db.insert(chunks).values(rows);

  return filing!.id;
}

describe("embedFilingChunks", () => {
  it("embeds every chunk once", async () => {
    const company = await createCompany();
    const filingId = await createFiling(company.id, 2, ["Capacity rose", "Dividend declared"]);

    expect(await embedFilingChunks(filingId)).toBe(2);
    expect(await db.select().from(chunks).where(isNull(chunks.embedding))).toEqual([]);

    // Nothing left to do the second time.
    expect(await embedFilingChunks(filingId)).toBe(0);
  });
});

describe("searchChunks", () => {
  it("returns the closest chunks first, with page numbers", async () => {
    const company = await createCompany();

    const filingId = await createFiling(company.id, 2, [
      "Dividend of five rupees per share was declared",
      "The Rajasthan unit was commissioned in August",
      "Freight costs rose during the monsoon",
    ]);
    await embedFilingChunks(filingId);

    const matches = await searchChunks("Rajasthan unit commissioned", { companyId: company.id });
    expect(matches[0]).toMatchObject({ filingId, pageNumber: 2 });

    const distances = matches.map((match) => match.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("searches only the given filings or company", async () => {
    const company = await createCompany("Ambuja Cements");
    const other = await createCompany("UltraTech Cement");

    const q1 = await createFiling(company.id, 1, ["Rajasthan unit on track"]);
    const q2 = await createFiling(company.id, 2, ["Rajasthan unit commissioned"]);
    const elsewhere = await createFiling(other.id, 2, ["Rajasthan unit commissioned"]);

    for (const id of [q1, q2, elsewhere]) await embedFilingChunks(id);

    const byFiling = await searchChunks("Rajasthan", { filingIds: [q2] });
    expect(byFiling.map((match) => match.filingId)).toEqual([q2]);

    const byCompany = await searchChunks("Rajasthan", { companyId: company.id });
    expect(byCompany.map((match) => match.filingId).sort()).toEqual([q1, q2].sort());
  });

  it("skips chunks without embeddings and empty filing lists", async () => {
    const company = await createCompany();
    await createFiling(company.id, 2, ["Not embedded yet"]);

    expect(await searchChunks("embedded", { companyId: company.id })).toEqual([]);
    vi.mocked(embedTexts).mockClear();

    expect(await searchChunks("anything", { filingIds: [] })).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
  });
});
