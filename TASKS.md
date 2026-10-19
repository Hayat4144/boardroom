# TASKS — Boardroom

Owner tags: **[CC]** = Claude Code, **[HAYAT]** = you write it by hand (no AI writing the code; asking questions is fine).

## Roles

- **Claude Code:** project setup, Drizzle schema and migrations, Better Auth login, Express API routes, React + Vite frontend, S3 storage, PDF text extraction, ingestion scripts, job queue, LLM HTTP client, logging, tests.
- **Hayat:** everything that makes it an agent — extraction prompts and schemas, the agent loop, tools, promise checking, retrieval logic, evals. Also: choosing companies, collecting documents, reviewing Claude Code's output.

## Phase 0 — Setup

- [ ] [HAYAT] Pick one sector and 5 companies to start (expand to 20 later).
- [ ] [HAYAT] Manually download, per company: last 4 quarters' earnings-call transcripts + quarterly results PDFs.
- [ ] [HAYAT] Create the repo, add CLAUDE.md and TASKS.md, get an LLM API key.
- [ ] [HAYAT] Create a private S3 dev bucket + an IAM user limited to that bucket (never use root keys).
- [x] [CC] pnpm monorepo, TypeScript, lint/format, local Postgres + pgvector, `.env.example`.
- [x] [CC] Drizzle schema + migrations for all tables in CLAUDE.md; seed script for companies + one admin user.
- [x] [CC] S3 storage service (put, stream get, delete, presigned URLs) with configurable endpoint for R2; nothing stored locally.

## Phase 1 — Auth + plumbing

- [x] [CC] Better Auth (email + password) in Express with Drizzle adapter; `requireAuth` and `requireAdmin` middleware.
- [ ] [CC] React login/signup pages, protected routes, session handling.
- [ ] [CC] Watchlist API + UI (add/remove companies).
- [ ] [CC] Express API with all routes from CLAUDE.md, wired to HAYAT stubs, with access rules applied.
- [ ] [CC] PDF upload to S3 + `process` endpoint (admin): stream from S3 → page text → `document_pages` + `chunks`.
- [ ] [CC] Company page with Filings / Promises / Ask tabs; admin LLM calls page.
- [x] [CC] `LLMClient` thin wrapper + logging to `llm_calls`; per-user rate limit on Ask.
- [ ] [HAYAT] Review the code; sign up, add a company, run it end-to-end with stubs throwing TODO.

## Phase 2 — Learn: LLM basics + structured output

- [ ] [HAYAT] Call the LLM directly from a script; read the raw response format.
- [ ] [HAYAT] Get JSON output that matches a Zod schema; handle invalid JSON (retry/repair).
- [ ] [HAYAT] Implement `extractPromises()` for one transcript: statement, metric, target, deadline, speaker, page.
- [ ] [HAYAT] Handle long transcripts: split by pages/sections, merge and dedupe promises.

## Phase 3 — Learn: evals (do this early, not last)

- [ ] [HAYAT] Hand-label all real promises in 3 transcripts — your "answer key".
- [ ] [HAYAT] Write an eval script: precision (how many extracted are real) and recall (how many real ones were found).
- [ ] [HAYAT] Improve prompts/chunking; record scores after each change.

## Phase 4 — Learn: promise checking

- [ ] [HAYAT] Implement `checkPromises()`: find the later results/transcript covering each deadline, decide kept / missed / delayed / unclear with evidence and page.
- [ ] [HAYAT] Use code for numeric comparisons; use the LLM only for judgment and wording.
- [ ] [HAYAT] Hand-check 20 judgments; add them to evals.

## Phase 5 — Learn: retrieval + the agent loop

- [ ] [CC] Embedding job that fills `chunks.embedding` + a similarity search service (no prompts).
- [ ] [HAYAT] Write the agent loop yourself: send messages + tools → read tool call → run tool → append result → repeat; step limit; stop condition.
- [ ] [HAYAT] Define tools: `search_documents`, `open_page`, `get_promises`, `compare_periods`.
- [ ] [HAYAT] Implement `answerQuestion()` with mandatory citations; answer "not found" instead of guessing.
- [ ] [HAYAT] 30 hand-written questions with known answers → measure answer accuracy and citation accuracy.

## Phase 6 — Production habits

- [ ] [HAYAT] Add a verifier step: check every number in an answer against the cited page.
- [ ] [HAYAT] Track cost per question, per user and per transcript from `llm_calls`; reduce it.
- [ ] [CC] Error handling, retries, and job status shown in UI.
- [ ] [CC] Password reset + email verification with a real email provider.
- [ ] [HAYAT] Write a short case study: what worked, scores before/after (for LinkedIn/portfolio).

## Later (optional)

- [ ] [CC] `fetch-bse.ts` automated ingestion into S3 + daily schedule.
- [ ] [HAYAT] Red-flag detector.
- [ ] [HAYAT] Quarterly brief generator.
- [ ] [CC] Email alerts for watchlist companies.

## How to work with Claude Code

1. Give it one task at a time: "Do Phase 1, task 1 from TASKS.md."
2. Review the diff before accepting; ask it to explain anything you don't understand.
3. After each task, tick the box and commit.
4. If Claude Code starts writing agent or extraction logic, stop it — that part is yours.

Displaying TASKS.md.
