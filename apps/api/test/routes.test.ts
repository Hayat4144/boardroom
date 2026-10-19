import { readFileSync } from "node:fs";
import {
  chunks,
  documentPages,
  filings,
  llmCalls,
  promiseChecks,
  promises,
  questions,
  type Database,
} from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { createTestDb } from "@boardroom/db/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as AnswerQuestionModule from "../src/agent/answerQuestion";
import { answerQuestion } from "../src/agent/answerQuestion";
import type { SessionUser } from "../src/auth/middleware";
import { buildApp, createCompany, createUser } from "./helpers";

// Keep the real HAYAT stubs (they throw TODO) but allow per-test overrides.
vi.mock("../src/agent/answerQuestion", async (importOriginal) => {
  const mod = await importOriginal<typeof AnswerQuestionModule>();
  return { answerQuestion: vi.fn(mod.answerQuestion) };
});

const PDF = readFileSync(new URL("./fixtures/transcript.pdf", import.meta.url));
const SCANNED = readFileSync(new URL("./fixtures/scanned.pdf", import.meta.url));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
let alice: SessionUser;
let bob: SessionUser;
let admin: SessionUser;
let ctx: ReturnType<typeof buildApp>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});
afterAll(() => testDb.close());

beforeEach(async () => {
  await testDb.reset();
  alice = await createUser(db);
  bob = await createUser(db);
  admin = await createUser(db, "admin");
  ctx = buildApp(db, [alice, bob, admin]);
});

const as = (u: SessionUser) => ({ "x-test-user": u.id });

async function uploadAndProcess(companyId: string) {
  const up = await request(ctx.app)
    .post(`/api/companies/${companyId}/filings/upload`)
    .set(as(admin))
    .field("title", "Q2 FY26 call")
    .attach("file", PDF, { filename: "call.pdf", contentType: "application/pdf" });
  expect(up.status).toBe(201);
  const proc = await request(ctx.app)
    .post(`/api/filings/${up.body.filing.id}/process`)
    .set(as(admin));
  expect(proc.status).toBe(200);
  return up.body.filing.id as string;
}

describe("auth + basics", () => {
  it("requires a session for every /api route", async () => {
    for (const path of ["/api/me", "/api/companies", "/api/watchlist", "/api/questions"]) {
      expect((await request(ctx.app).get(path)).status).toBe(401);
    }
  });

  it("GET /api/me returns the current user", async () => {
    const res = await request(ctx.app).get("/api/me").set(as(alice));
    expect(res.body.user).toMatchObject({ id: alice.id, role: "user" });
  });

  it("unknown routes are JSON 404s", async () => {
    const res = await request(ctx.app).get("/api/nope").set(as(alice));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

describe("companies", () => {
  it("lists and searches by name, NSE symbol or BSE code", async () => {
    const infy = await createCompany(db, "Infosys Ltd");
    await createCompany(db, "ITC Ltd");
    const all = await request(ctx.app).get("/api/companies").set(as(alice));
    expect(all.body.companies.map((c: { name: string }) => c.name)).toEqual([
      "ITC Ltd",
      "Infosys Ltd",
    ]);

    const byName = await request(ctx.app).get("/api/companies?q=infos").set(as(alice));
    expect(byName.body.companies).toHaveLength(1);
    const byCode = await request(ctx.app).get(`/api/companies?q=${infy.bseCode}`).set(as(alice));
    expect(byCode.body.companies[0].id).toBe(infy.id);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await createCompany(db, "Infosys Ltd");
    const res = await request(ctx.app).get("/api/companies?q=%25").set(as(alice));
    expect(res.body.companies).toHaveLength(0);
  });

  it("returns detail with counts, 404 for unknown and 400 for malformed ids", async () => {
    const c = await createCompany(db);
    const res = await request(ctx.app).get(`/api/companies/${c.id}`).set(as(alice));
    expect(res.body.company).toMatchObject({
      id: c.id,
      inWatchlist: false,
      counts: { filings: 0, processedFilings: 0, promises: 0 },
    });
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await request(ctx.app).get(`/api/companies/${missing}`).set(as(alice))).status).toBe(
      404,
    );
    expect((await request(ctx.app).get("/api/companies/abc").set(as(alice))).status).toBe(400);
  });
});

describe("watchlist", () => {
  it("adds idempotently, lists per user, and removes", async () => {
    const c = await createCompany(db);
    for (let i = 0; i < 2; i++) {
      const res = await request(ctx.app)
        .post("/api/watchlist")
        .set(as(alice))
        .send({ companyId: c.id });
      expect(res.status).toBe(201);
    }
    const mine = await request(ctx.app).get("/api/watchlist").set(as(alice));
    expect(mine.body.companies).toHaveLength(1);
    const bobs = await request(ctx.app).get("/api/watchlist").set(as(bob));
    expect(bobs.body.companies).toHaveLength(0);

    const listed = await request(ctx.app).get("/api/companies").set(as(alice));
    expect(listed.body.companies[0].inWatchlist).toBe(true);

    expect((await request(ctx.app).delete(`/api/watchlist/${c.id}`).set(as(alice))).status).toBe(
      204,
    );
    expect(
      (await request(ctx.app).get("/api/watchlist").set(as(alice))).body.companies,
    ).toHaveLength(0);
  });

  it("validates the body and the company", async () => {
    expect(
      (await request(ctx.app).post("/api/watchlist").set(as(alice)).send({ companyId: "x" }))
        .status,
    ).toBe(400);
    const res = await request(ctx.app)
      .post("/api/watchlist")
      .set(as(alice))
      .send({ companyId: "00000000-0000-4000-8000-000000000000" });
    expect(res.status).toBe(404);
  });
});

describe("filings: upload, process, presigned URL", () => {
  it("is admin-only", async () => {
    const c = await createCompany(db);
    const up = await request(ctx.app)
      .post(`/api/companies/${c.id}/filings/upload`)
      .set(as(alice))
      .field("title", "x")
      .attach("file", PDF, "call.pdf");
    expect(up.status).toBe(403);
    expect(ctx.objects.size).toBe(0);
    const proc = await request(ctx.app)
      .post("/api/filings/00000000-0000-4000-8000-000000000000/process")
      .set(as(alice));
    expect(proc.status).toBe(403);
  });

  it("stores the PDF, extracts pages + chunks and enqueues extraction", async () => {
    const c = await createCompany(db);
    const filingId = await uploadAndProcess(c.id);

    expect([...ctx.objects.keys()]).toEqual([`filings/${c.id}/${filingId}.pdf`]);
    const [filing] = await db.select().from(filings).where(eq(filings.id, filingId));
    expect(filing).toMatchObject({ status: "processed", source: "manual", uploadedBy: admin.id });

    const pages = await db.select().from(documentPages).where(eq(documentPages.filingId, filingId));
    expect(pages.map((p) => p.pageNumber).sort()).toEqual([1, 2, 3]);
    expect(pages.find((p) => p.pageNumber === 1)!.text).toContain("Earnings Call Transcript");
    const chunkRows = await db.select().from(chunks).where(eq(chunks.filingId, filingId));
    expect(chunkRows.length).toBeGreaterThanOrEqual(2);
    expect(chunkRows.every((ch) => ch.pageNumber >= 1 && ch.embedding === null)).toBe(true);
    expect(ctx.jobs.enqueueExtractPromises).toHaveBeenCalledWith(filingId);

    // Re-processing replaces, not duplicates.
    await request(ctx.app).post(`/api/filings/${filingId}/process`).set(as(admin));
    const again = await db.select().from(documentPages).where(eq(documentPages.filingId, filingId));
    expect(again).toHaveLength(3);

    const list = await request(ctx.app).get(`/api/companies/${c.id}/filings`).set(as(alice));
    expect(list.body.filings[0]).toMatchObject({
      id: filingId,
      hasFile: true,
      status: "processed",
    });
    expect(list.body.filings[0].storageKey).toBeUndefined();

    const url = await request(ctx.app).get(`/api/filings/${filingId}/url`).set(as(alice));
    expect(url.status).toBe(200);
    expect(url.body.url).toContain(`filings/${c.id}/${filingId}.pdf`);
  });

  it("rejects non-PDF uploads and missing fields", async () => {
    const c = await createCompany(db);
    const notPdf = await request(ctx.app)
      .post(`/api/companies/${c.id}/filings/upload`)
      .set(as(admin))
      .field("title", "x")
      .attach("file", Buffer.from("hello"), "x.pdf");
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.error).toBe("invalid_file");
    const noTitle = await request(ctx.app)
      .post(`/api/companies/${c.id}/filings/upload`)
      .set(as(admin))
      .attach("file", PDF, "call.pdf");
    expect(noTitle.status).toBe(400);
    expect(ctx.objects.size).toBe(0);
  });

  it("returns 409 for a duplicate source URL and removes the orphaned object", async () => {
    const c = await createCompany(db);
    const send = () =>
      request(ctx.app)
        .post(`/api/companies/${c.id}/filings/upload`)
        .set(as(admin))
        .field("title", "x")
        .field("url", "https://www.bseindia.com/a.pdf")
        .attach("file", PDF, "call.pdf");
    expect((await send()).status).toBe(201);
    const dup = await send();
    expect(dup.status).toBe(409);
    expect(ctx.objects.size).toBe(1);
  });

  it("marks scanned PDFs (no text) as failed with 422", async () => {
    const c = await createCompany(db);
    const up = await request(ctx.app)
      .post(`/api/companies/${c.id}/filings/upload`)
      .set(as(admin))
      .field("title", "scan")
      .attach("file", SCANNED, "scan.pdf");
    const proc = await request(ctx.app)
      .post(`/api/filings/${up.body.filing.id}/process`)
      .set(as(admin));
    expect(proc.status).toBe(422);
    expect(proc.body.error).toBe("no_text");
    const [f] = await db.select().from(filings).where(eq(filings.id, up.body.filing.id));
    expect(f!.status).toBe("failed");
    expect(ctx.jobs.enqueueExtractPromises).not.toHaveBeenCalled();
  });

  it("presigned URL: 404 unknown filing, 409 when there is no stored file", async () => {
    const c = await createCompany(db);
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await request(ctx.app).get(`/api/filings/${missing}/url`).set(as(alice))).status).toBe(
      404,
    );
    const [f] = await db
      .insert(filings)
      .values({ companyId: c.id, source: "bse", title: "link only" })
      .returning();
    expect((await request(ctx.app).get(`/api/filings/${f!.id}/url`).set(as(alice))).status).toBe(
      409,
    );
  });
});

describe("promises", () => {
  it("lists promises with their latest check", async () => {
    const c = await createCompany(db);
    const filingId = await uploadAndProcess(c.id);
    const [p] = await db
      .insert(promises)
      .values({
        companyId: c.id,
        sourceFilingId: filingId,
        sourcePage: 1,
        statement: "3-5% growth",
      })
      .returning();
    await db.insert(promiseChecks).values([
      { promiseId: p!.id, status: "pending", checkedAt: new Date("2026-01-01") },
      { promiseId: p!.id, status: "kept", evidence: "grew 4%", checkedAt: new Date("2026-04-01") },
    ]);
    const res = await request(ctx.app).get(`/api/companies/${c.id}/promises`).set(as(alice));
    expect(res.body.promises).toHaveLength(1);
    expect(res.body.promises[0]).toMatchObject({
      statement: "3-5% growth",
      sourceFilingTitle: "Q2 FY26 call",
      latestCheck: { status: "kept", evidence: "grew 4%" },
    });
  });

  it("check is admin-only and answers 501 while checkPromises() is a stub", async () => {
    const c = await createCompany(db);
    const url = `/api/companies/${c.id}/promises/check`;
    expect((await request(ctx.app).post(url).set(as(alice))).status).toBe(403);
    const res = await request(ctx.app).post(url).set(as(admin));
    expect(res.status).toBe(501);
    expect(res.body).toEqual({ error: "not_implemented", message: "TODO(HAYAT): implement" });
  });
});

describe("ask + question history", () => {
  it("answers 501 while answerQuestion() is a stub and stores nothing", async () => {
    const c = await createCompany(db);
    const res = await request(ctx.app)
      .post(`/api/companies/${c.id}/ask`)
      .set(as(alice))
      .send({ question: "What is the margin guidance?" });
    expect(res.status).toBe(501);
    expect(await db.select().from(questions)).toHaveLength(0);
  });

  it("stores answers per user and only shows a user their own history", async () => {
    const c = await createCompany(db);
    const citations = [{ filingId: "f1", page: 2, quote: "20-22%" }];
    vi.mocked(answerQuestion).mockResolvedValueOnce({ answer: "20-22%", citations });

    const res = await request(ctx.app)
      .post(`/api/companies/${c.id}/ask`)
      .set(as(alice))
      .send({ question: "  What is the margin guidance?  " });
    expect(res.status).toBe(201);
    expect(res.body.question).toMatchObject({
      userId: alice.id,
      question: "What is the margin guidance?",
      answer: "20-22%",
      citations,
    });
    expect(answerQuestion).toHaveBeenLastCalledWith(c.id, "What is the margin guidance?");

    const mine = await request(ctx.app).get(`/api/questions?companyId=${c.id}`).set(as(alice));
    expect(mine.body.questions).toHaveLength(1);
    const bobs = await request(ctx.app).get("/api/questions").set(as(bob));
    expect(bobs.body.questions).toHaveLength(0);
  });

  it("rejects malformed answers from answerQuestion()", async () => {
    const c = await createCompany(db);
    vi.mocked(answerQuestion).mockResolvedValueOnce({
      answer: "x",
      citations: [{ page: 1 }],
    } as never);
    const res = await request(ctx.app)
      .post(`/api/companies/${c.id}/ask`)
      .set(as(alice))
      .send({ question: "Anything?" });
    expect(res.status).toBe(500);
    expect(await db.select().from(questions)).toHaveLength(0);
  });

  it("validates the question", async () => {
    const c = await createCompany(db);
    const res = await request(ctx.app)
      .post(`/api/companies/${c.id}/ask`)
      .set(as(alice))
      .send({ question: "x" });
    expect(res.status).toBe(400);
  });

  it("rate-limits per user", async () => {
    ctx = buildApp(db, [alice, bob, admin], { askDailyLimit: 2 });
    const c = await createCompany(db);
    const ask = (u: SessionUser) =>
      request(ctx.app)
        .post(`/api/companies/${c.id}/ask`)
        .set(as(u))
        .send({ question: "Guidance?" });
    expect((await ask(alice)).status).toBe(501);
    expect((await ask(alice)).status).toBe(501);
    const limited = await ask(alice);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");
    expect((await ask(bob)).status).toBe(501); // separate budget
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
    expect((await request(ctx.app).get("/api/llm-calls").set(as(alice))).status).toBe(403);
    const res = await request(ctx.app).get("/api/llm-calls").set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({
      calls: 2,
      costUsd: "0.001400",
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(res.body.calls.map((c: { failed: boolean }) => c.failed).sort()).toEqual([false, true]);
    expect(res.body.calls[0].request).toBeUndefined();

    const one = await request(ctx.app).get(`/api/llm-calls/${res.body.calls[0].id}`).set(as(admin));
    expect(one.body.call.id).toBe(res.body.calls[0].id);
  });
});
