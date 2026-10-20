import { readFileSync } from "node:fs";
import {
  chunks,
  documentPages,
  filings,
  llmCalls,
  promiseChecks,
  promises,
  questions,
} from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AnswerQuestionModule from "../src/agent/answerQuestion";
import { answerQuestion } from "../src/agent/answerQuestion";
import { app } from "../src/app";
import type { SessionUser } from "../src/auth/auth";
import { enqueueExtractPromises } from "../src/jobs/jobs";
import { as, createCompany, createUser, storedFiles, testDb } from "./helpers";

// The real app, with test stand-ins for the database, sign-in, S3 and the job queue.
vi.mock("../src/db", async () => ({ db: (await import("./helpers")).testDb.db }));

vi.mock("../src/auth/auth", async () => ({
  authHandler: vi.fn(),
  getSessionUser: (await import("./helpers")).sessionFromHeader,
}));

vi.mock("../src/services/storage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("./helpers")).memoryStorage,
}));

vi.mock("../src/jobs/jobs", () => ({ enqueueExtractPromises: vi.fn(async () => "job-1") }));

// Keep the real HAYAT stub (it throws TODO) but allow per-test overrides.
vi.mock("../src/agent/answerQuestion", async (importOriginal) => {
  const original = await importOriginal<typeof AnswerQuestionModule>();
  return { answerQuestion: vi.fn(original.answerQuestion) };
});

const PDF = readFileSync(new URL("./fixtures/transcript.pdf", import.meta.url));
const SCANNED = readFileSync(new URL("./fixtures/scanned.pdf", import.meta.url));
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

const db = testDb.db;
let alice: SessionUser;
let bob: SessionUser;

let admin: SessionUser;

beforeEach(async () => {
  await testDb.reset();
  storedFiles.clear();
  vi.clearAllMocks();

  alice = await createUser();
  bob = await createUser();
  admin = await createUser("admin");
});

function uploadPdf(companyId: string, file = PDF, title = "Q2 FY26 call") {
  return request(app)
    .post(`/api/companies/${companyId}/filings/upload`)
    .set(as(admin))
    .field("title", title)
    .attach("file", file, { filename: "call.pdf", contentType: "application/pdf" });
}

async function uploadAndProcess(companyId: string) {
  const upload = await uploadPdf(companyId);
  expect(upload.status).toBe(201);

  const filingId: string = upload.body.filing.id;
  const processed = await request(app).post(`/api/filings/${filingId}/process`).set(as(admin));
  expect(processed.status).toBe(200);

  return filingId;
}

describe("auth + basics", () => {
  it("requires a session for every /api route", async () => {
    for (const path of ["/api/me", "/api/companies", "/api/watchlist", "/api/questions"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it("GET /api/me returns the current user", async () => {
    const res = await request(app).get("/api/me").set(as(alice));
    expect(res.body.user).toMatchObject({ id: alice.id, role: "user" });
  });

  it("unknown routes are JSON 404s", async () => {
    const res = await request(app).get("/api/nope").set(as(alice));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

describe("companies", () => {
  it("lists and searches by name, NSE symbol or BSE code", async () => {
    const infy = await createCompany("Infosys Ltd");
    await createCompany("ITC Ltd");

    const all = await request(app).get("/api/companies").set(as(alice));
    const names = all.body.companies.map((c: { name: string }) => c.name);
    expect(names).toEqual(["ITC Ltd", "Infosys Ltd"]);

    const byName = await request(app).get("/api/companies?q=infos").set(as(alice));
    expect(byName.body.companies).toHaveLength(1);

    const byCode = await request(app).get(`/api/companies?q=${infy.bseCode}`).set(as(alice));
    expect(byCode.body.companies[0].id).toBe(infy.id);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await createCompany("Infosys Ltd");
    const res = await request(app).get("/api/companies?q=%25").set(as(alice));
    expect(res.body.companies).toHaveLength(0);
  });

  it("returns detail with counts, 404 for unknown and 400 for malformed ids", async () => {
    const company = await createCompany();
    const res = await request(app).get(`/api/companies/${company.id}`).set(as(alice));

    expect(res.body.company).toMatchObject({
      id: company.id,
      inWatchlist: false,
      counts: { filings: 0, processedFilings: 0, promises: 0 },
    });

    expect((await request(app).get(`/api/companies/${MISSING_ID}`).set(as(alice))).status).toBe(
      404,
    );
    expect((await request(app).get("/api/companies/abc").set(as(alice))).status).toBe(400);
  });
});

describe("watchlist", () => {
  it("adds idempotently, lists per user, and removes", async () => {
    const company = await createCompany();
    const add = () =>
      request(app).post("/api/watchlist").set(as(alice)).send({ companyId: company.id });

    expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(201);

    const mine = await request(app).get("/api/watchlist").set(as(alice));
    const bobs = await request(app).get("/api/watchlist").set(as(bob));
    const listed = await request(app).get("/api/companies").set(as(alice));

    expect(mine.body.companies).toHaveLength(1);
    expect(bobs.body.companies).toHaveLength(0);
    expect(listed.body.companies[0].inWatchlist).toBe(true);

    const removed = await request(app).delete(`/api/watchlist/${company.id}`).set(as(alice));
    const after = await request(app).get("/api/watchlist").set(as(alice));

    expect(removed.status).toBe(204);
    expect(after.body.companies).toHaveLength(0);
  });

  it("validates the body and the company", async () => {
    const add = (companyId: string) =>
      request(app).post("/api/watchlist").set(as(alice)).send({ companyId });

    expect((await add("x")).status).toBe(400);
    expect((await add(MISSING_ID)).status).toBe(404);
  });
});

describe("filings: upload, process, presigned URL", () => {
  it("is admin-only", async () => {
    const company = await createCompany();

    const upload = await request(app)
      .post(`/api/companies/${company.id}/filings/upload`)
      .set(as(alice))
      .field("title", "x")
      .attach("file", PDF, "call.pdf");

    const processed = await request(app).post(`/api/filings/${MISSING_ID}/process`).set(as(alice));

    expect(upload.status).toBe(403);
    expect(processed.status).toBe(403);
    expect(storedFiles.size).toBe(0);
  });

  it("stores the PDF, extracts pages + chunks and enqueues extraction", async () => {
    const company = await createCompany();
    const filingId = await uploadAndProcess(company.id);
    expect([...storedFiles.keys()]).toEqual([`filings/${company.id}/${filingId}.pdf`]);

    const [filing] = await db.select().from(filings).where(eq(filings.id, filingId));
    expect(filing).toMatchObject({ status: "processed", source: "manual", uploadedBy: admin.id });

    const pages = await db.select().from(documentPages).where(eq(documentPages.filingId, filingId));
    expect(pages.map((p) => p.pageNumber).sort()).toEqual([1, 2, 3]);
    expect(pages.find((p) => p.pageNumber === 1)!.text).toContain("Earnings Call Transcript");

    const chunkRows = await db.select().from(chunks).where(eq(chunks.filingId, filingId));
    expect(chunkRows.length).toBeGreaterThanOrEqual(2);
    expect(chunkRows.every((c) => c.pageNumber >= 1 && c.embedding === null)).toBe(true);

    expect(enqueueExtractPromises).toHaveBeenCalledWith(filingId);
  });

  it("re-processing replaces pages instead of duplicating them", async () => {
    const company = await createCompany();
    const filingId = await uploadAndProcess(company.id);
    await request(app).post(`/api/filings/${filingId}/process`).set(as(admin));

    const pages = await db.select().from(documentPages).where(eq(documentPages.filingId, filingId));
    expect(pages).toHaveLength(3);
  });

  it("lists filings without the S3 key and gives a presigned URL", async () => {
    const company = await createCompany();
    const filingId = await uploadAndProcess(company.id);

    const list = await request(app).get(`/api/companies/${company.id}/filings`).set(as(alice));
    expect(list.body.filings[0]).toMatchObject({
      id: filingId,
      hasFile: true,
      status: "processed",
    });
    expect(list.body.filings[0].storageKey).toBeUndefined();

    const url = await request(app).get(`/api/filings/${filingId}/url`).set(as(alice));
    expect(url.status).toBe(200);
    expect(url.body.url).toContain(`filings/${company.id}/${filingId}.pdf`);
  });

  it("rejects non-PDF uploads and missing fields", async () => {
    const company = await createCompany();
    const notPdf = await uploadPdf(company.id, Buffer.from("hello"));
    expect(notPdf.status).toBe(400);

    expect(notPdf.body.error).toBe("invalid_file");

    const noTitle = await request(app)
      .post(`/api/companies/${company.id}/filings/upload`)
      .set(as(admin))
      .attach("file", PDF, "call.pdf");

    expect(noTitle.status).toBe(400);
    expect(storedFiles.size).toBe(0);
  });

  it("returns 409 for a duplicate source URL and removes the orphaned file", async () => {
    const company = await createCompany();

    const send = () =>
      request(app)
        .post(`/api/companies/${company.id}/filings/upload`)
        .set(as(admin))
        .field("title", "x")
        .field("url", "https://www.bseindia.com/a.pdf")
        .attach("file", PDF, "call.pdf");

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(409);
    expect(storedFiles.size).toBe(1);
  });

  it("marks scanned PDFs (no text) as failed with 422", async () => {
    const company = await createCompany();
    const upload = await uploadPdf(company.id, SCANNED, "scan");
    const filingId: string = upload.body.filing.id;

    const processed = await request(app).post(`/api/filings/${filingId}/process`).set(as(admin));
    expect(processed.status).toBe(422);
    expect(processed.body.error).toBe("no_text");

    const [filing] = await db.select().from(filings).where(eq(filings.id, filingId));
    expect(filing!.status).toBe("failed");
    expect(enqueueExtractPromises).not.toHaveBeenCalled();
  });

  it("presigned URL: 404 unknown filing, 409 when there is no stored file", async () => {
    const company = await createCompany();
    const unknown = await request(app).get(`/api/filings/${MISSING_ID}/url`).set(as(alice));
    expect(unknown.status).toBe(404);

    const [linkOnly] = await db
      .insert(filings)
      .values({ companyId: company.id, source: "bse", title: "link only" })
      .returning();

    const noFile = await request(app).get(`/api/filings/${linkOnly!.id}/url`).set(as(alice));
    expect(noFile.status).toBe(409);
  });
});

describe("promises", () => {
  it("lists promises with their latest check", async () => {
    const company = await createCompany();
    const filingId = await uploadAndProcess(company.id);

    const [promise] = await db
      .insert(promises)
      .values({
        companyId: company.id,
        sourceFilingId: filingId,
        sourcePage: 1,

        statement: "3-5% growth",
      })
      .returning();

    await db.insert(promiseChecks).values([
      { promiseId: promise!.id, status: "pending", checkedAt: new Date("2026-01-01") },
      {
        promiseId: promise!.id,
        status: "kept",
        evidence: "grew 4%",

        checkedAt: new Date("2026-04-01"),
      },
    ]);

    const res = await request(app).get(`/api/companies/${company.id}/promises`).set(as(alice));
    expect(res.body.promises).toHaveLength(1);

    expect(res.body.promises[0]).toMatchObject({
      statement: "3-5% growth",
      sourceFilingTitle: "Q2 FY26 call",
      latestCheck: { status: "kept", evidence: "grew 4%" },
    });
  });

  it("check is admin-only and answers 501 while checkPromises() is a stub", async () => {
    const company = await createCompany();
    const url = `/api/companies/${company.id}/promises/check`;
    expect((await request(app).post(url).set(as(alice))).status).toBe(403);

    const res = await request(app).post(url).set(as(admin));
    expect(res.status).toBe(501);
    expect(res.body).toEqual({ error: "not_implemented", message: "TODO(HAYAT): implement" });
  });
});

describe("ask + question history", () => {
  const ask = (user: SessionUser, companyId: string, question: string) =>
    request(app).post(`/api/companies/${companyId}/ask`).set(as(user)).send({ question });

  it("answers 501 while answerQuestion() is a stub and stores nothing", async () => {
    const company = await createCompany();
    const res = await ask(alice, company.id, "What is the margin guidance?");

    expect(res.status).toBe(501);
    expect(await db.select().from(questions)).toHaveLength(0);
  });

  it("stores answers per user and only shows a user their own history", async () => {
    const company = await createCompany();
    const citations = [{ filingId: "f1", page: 2, quote: "20-22%" }];
    vi.mocked(answerQuestion).mockResolvedValueOnce({ answer: "20-22%", citations });

    const res = await ask(alice, company.id, "  What is the margin guidance?  ");
    expect(res.status).toBe(201);
    expect(answerQuestion).toHaveBeenLastCalledWith(company.id, "What is the margin guidance?");

    expect(res.body.question).toMatchObject({
      userId: alice.id,
      question: "What is the margin guidance?",
      answer: "20-22%",

      citations,
    });

    const mine = await request(app).get(`/api/questions?companyId=${company.id}`).set(as(alice));
    const bobs = await request(app).get("/api/questions").set(as(bob));

    expect(mine.body.questions).toHaveLength(1);
    expect(bobs.body.questions).toHaveLength(0);
  });

  it("rejects malformed answers from answerQuestion()", async () => {
    const company = await createCompany();
    vi.mocked(answerQuestion).mockResolvedValueOnce({
      answer: "x",
      citations: [{ page: 1 }],
    } as never);
    const res = await ask(alice, company.id, "Anything?");

    expect(res.status).toBe(500);
    expect(await db.select().from(questions)).toHaveLength(0);
  });

  it("validates the question", async () => {
    const company = await createCompany();
    expect((await ask(alice, company.id, "x")).status).toBe(400);
  });

  it("rate-limits per user (ASK_DAILY_LIMIT is 2 in tests)", async () => {
    const company = await createCompany();
    expect((await ask(alice, company.id, "Guidance?")).status).toBe(501);
    expect((await ask(alice, company.id, "Guidance?")).status).toBe(501);

    const limited = await ask(alice, company.id, "Guidance?");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");

    // Bob has a separate budget.
    expect((await ask(bob, company.id, "Guidance?")).status).toBe(501);
  });
});

describe("llm-calls (admin)", () => {
  it("is admin-only and returns calls with totals", async () => {
    await db.insert(llmCalls).values([
      {
        purpose: "ask",
        model: "claude-opus-5-5",

        inputTokens: 100,
        outputTokens: 50,
        costUsd: "0.001400",
      },
      {
        purpose: "extract_promises",
        model: "claude-opus-5-5",
        response: { error: { message: "x" } },
      },
    ]);

    expect((await request(app).get("/api/llm-calls").set(as(alice))).status).toBe(403);
    const res = await request(app).get("/api/llm-calls").set(as(admin));
    expect(res.status).toBe(200);

    expect(res.body.totals).toEqual({
      calls: 2,
      costUsd: "0.001400",
      inputTokens: 100,

      outputTokens: 50,
    });
    expect(res.body.calls.map((c: { failed: boolean }) => c.failed).sort()).toEqual([false, true]);
    expect(res.body.calls[0].request).toBeUndefined();

    const one = await request(app).get(`/api/llm-calls/${res.body.calls[0].id}`).set(as(admin));
    expect(one.body.call.id).toBe(res.body.calls[0].id);
  });
});
