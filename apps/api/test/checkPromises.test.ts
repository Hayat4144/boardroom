import { chunks, documentPages, filings, promiseChecks, promises } from "@boardroom/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkPromises } from "../src/extraction/checkPromises";
import { callLLM, type ChatCompletion } from "../src/llm/llm";
import { embedFilingChunks } from "../src/services/search";
import { createCompany, testDb } from "./helpers";

vi.mock("../src/db", async () => ({ db: (await import("./helpers")).testDb.db }));

vi.mock("../src/services/embeddings", async () => {
  const { fakeVector } = await import("./helpers");
  return { embedTexts: vi.fn(async (texts: string[]) => texts.map(fakeVector)) };
});

vi.mock("../src/llm/llm", () => ({ DEFAULT_MODEL: "test-model", callLLM: vi.fn() }));

const db = testDb.db;

beforeEach(async () => {
  await testDb.reset();
  vi.clearAllMocks();
});

/** The LLM answers with this JSON (or raw text). */
function llmAnswers(content: object | string) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const completion = { choices: [{ message: { content: text } }] } as ChatCompletion;

  vi.mocked(callLLM).mockResolvedValue(completion);
}

async function createFiling(
  companyId: string,
  period: { fiscalYear: number; fiscalQuarter: number },
  type: "transcript" | "results",
  pageTexts: string[] = [],
) {
  const [filing] = await db
    .insert(filings)
    .values({
      companyId,
      source: "manual",
      type,

      title: `Q${period.fiscalQuarter} FY${period.fiscalYear} ${type}`,
      ...period,
      filedOn: "2026-05-05",

      status: "processed",
    })
    .returning();

  if (pageTexts.length > 0) {
    const rows = pageTexts.map((text, i) => ({ filingId: filing!.id, pageNumber: i + 1 }));
    await db.insert(documentPages).values(rows.map((row, i) => ({ ...row, text: pageTexts[i]! })));
    await db.insert(chunks).values(rows.map((row, i) => ({ ...row, content: pageTexts[i]! })));

    await embedFilingChunks(filing!.id);
  }

  return filing!;
}

/** Ambuja-style setup: a Q4 FY26 promise to commission a plant by Q2 FY27. */
async function setup() {
  const company = await createCompany("Ambuja Cements");
  const source = await createFiling(company.id, { fiscalYear: 26, fiscalQuarter: 4 }, "transcript");

  const [promise] = await db
    .insert(promises)
    .values({
      companyId: company.id,
      sourceFilingId: source.id,
      sourcePage: 7,

      statement: "We will commission the Rajasthan unit by Q2 FY27",
      metric: "Capacity",
      deadline: "2026-09-30",
    })
    .returning();

  return { company, promise: promise! };
}

describe("checkPromises", () => {
  it("marks a promise pending without calling the LLM when nothing later is uploaded", async () => {
    const { company, promise } = await setup();
    const checks = await checkPromises(company.id);

    expect(checks).toMatchObject([{ promiseId: promise.id, status: "pending" }]);
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("sends the matching pages to the LLM and stores its verdict with the cited page", async () => {
    const { company, promise } = await setup();
    const results = await createFiling(
      company.id,
      { fiscalYear: 27, fiscalQuarter: 2 },
      "results",
      [
        "Dividend of five rupees per share",
        "The Rajasthan unit was commissioned in August, adding capacity",
      ],
    );

    llmAnswers({ status: "kept", evidence: "Commissioned in August.", ref: 1 });
    const checks = await checkPromises(company.id);

    expect(checks).toMatchObject([
      {
        promiseId: promise.id,
        status: "kept",
        evidence: "Commissioned in August.",

        checkedAgainstFilingId: results.id,
        evidencePage: 2,
      },
    ]);

    const prompt = String(vi.mocked(callLLM).mock.calls[0]![0].messages[1]!.content);
    expect(prompt).toContain('timing="deadline quarter" number="2"');
    expect(prompt).toContain("Deadline: 2026-09-30 (Q2 FY27)");
  });

  it("leaves kept and missed promises alone on later runs", async () => {
    const { company, promise } = await setup();
    await db.insert(promiseChecks).values({ promiseId: promise.id, status: "kept" });

    expect(await checkPromises(company.id)).toEqual([]);
  });

  it("skips a promise when the LLM's answer can't be read", async () => {
    const { company } = await setup();
    await createFiling(company.id, { fiscalYear: 27, fiscalQuarter: 2 }, "results", [
      "The Rajasthan unit was commissioned",
    ]);

    llmAnswers("not json");
    expect(await checkPromises(company.id)).toEqual([]);

    llmAnswers({ status: "great", evidence: "?", ref: 1 });
    expect(await checkPromises(company.id)).toEqual([]);
  });
});
