import {
  companies,
  dateToPeriod,
  documentPages,
  filings,
  formatPeriod,
  promiseChecks,
  promises,
  type Filing,
  type NewPromiseCheck,
  type PromiseCheck,
  type PromiseRecord,
} from "@boardroom/db";
import { and, desc, eq, inArray, or } from "@boardroom/db/orm";
import { z } from "zod";
import { db } from "../db";
import { callLLM, DEFAULT_MODEL } from "../llm/llm";
import { searchChunks, type ChunkMatch } from "../services/search";
import { findEvidenceFilings } from "./findEvidenceFilings";
import { buildCheckUserPrompt, CHECK_SYSTEM_PROMPT, type CheckPromptPage } from "./prompts";

/** Promises checked at the same time (each one is a single LLM call). */
const CONCURRENCY = 4;

/** Pages sent to the LLM: from the deadline quarter or later, and from before it. */
const MAIN_PAGES = 4;
const EARLY_PAGES = 2;

/** Chunks further than this (cosine distance) are about something else. */
const MAX_DISTANCE = 0.75;

/** Once a promise is kept or missed, later runs leave it alone. */
const FINAL_STATUSES = new Set(["kept", "missed"]);

const verdictSchema = z.object({
  status: z.enum(["kept", "missed", "delayed", "pending", "unclear"]),
  evidence: z.string().min(1),
  ref: z.number().int().nullish(),
});

type Timing = CheckPromptPage["timing"];

/**
 * Check a company's promises against later filings and record the results
 * in `promise_checks`. Returns the checks that were created.
 */
export async function checkPromises(companyId: string): Promise<PromiseCheck[]> {
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId));

  if (!company) throw new Error(`Company ${companyId} not found`);

  const [companyPromises, companyFilings] = await Promise.all([
    db
      .select()
      .from(promises)
      .where(eq(promises.companyId, companyId))
      .orderBy(desc(promises.deadline)),
    db
      .select()
      .from(filings)
      .where(and(eq(filings.companyId, companyId), eq(filings.status, "processed"))),
  ]);

  const latest = await getLatestStatuses(companyPromises.map((promise) => promise.id));
  const filingIds = new Set(companyFilings.map((filing) => filing.id));

  // Skip settled promises, and ones whose source filing is no longer processed.
  const toCheck = companyPromises.filter(
    (promise) =>
      !FINAL_STATUSES.has(latest.get(promise.id) ?? "") && filingIds.has(promise.sourceFilingId),
  );

  const created: PromiseCheck[] = [];

  for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
    const group = toCheck.slice(i, i + CONCURRENCY);
    const checks = await Promise.all(
      group.map((promise) => checkOne(promise, companyFilings, company.name)),
    );

    const rows = checks.filter((check) => check !== null);
    if (rows.length > 0) created.push(...(await db.insert(promiseChecks).values(rows).returning()));
  }

  console.log(`[checkPromises] ${companyId}: ${created.length} of ${toCheck.length} checked`);
  return created;
}

/** One promise → one check, or null if the LLM's answer couldn't be used. */
async function checkOne(
  promise: PromiseRecord,
  companyFilings: Filing[],
  companyName: string,
): Promise<NewPromiseCheck | null> {
  // Step 3: which later filings can say whether it came true.
  const evidence = findEvidenceFilings(promise, companyFilings);
  const reportedFilings = [...evidence.deadlineQuarter, ...evidence.after];

  if (reportedFilings.length === 0 && evidence.before.length === 0) {
    return pendingCheck(promise.id, "No later filings uploaded yet.");
  }

  // Step 4: the pages closest in meaning to the promise.
  const query = [promise.statement, promise.metric, promise.targetValue].filter(Boolean).join(" ");
  const [mainMatches, earlyMatches] = await Promise.all([
    searchChunks(query, { filingIds: reportedFilings.map((filing) => filing.id), limit: 12 }),
    searchChunks(query, { filingIds: evidence.before.map((filing) => filing.id), limit: 6 }),
  ]);

  const timing = new Map<string, Timing>();
  for (const filing of evidence.before) timing.set(filing.id, "before deadline");
  for (const filing of evidence.deadlineQuarter) timing.set(filing.id, "deadline quarter");

  // No deadline: later filings count as "after", there's no quarter to wait for.
  for (const filing of evidence.after) timing.set(filing.id, "after deadline");

  const pages = await loadPages(
    [...topPages(mainMatches, MAIN_PAGES), ...topPages(earlyMatches, EARLY_PAGES)],
    companyFilings,
    timing,
  );

  const deadlineReported = reportedFilings.length > 0;

  if (pages.length === 0) {
    const where = deadlineReported ? "later filings" : "filings so far";
    if (!deadlineReported) return pendingCheck(promise.id, `Not mentioned in ${where}.`);

    return { promiseId: promise.id, status: "unclear", evidence: `Not mentioned in ${where}.` };
  }

  // Step 5: the LLM judges from those pages.
  const source = companyFilings.find((filing) => filing.id === promise.sourceFilingId)!;
  const userPrompt = buildCheckUserPrompt({
    companyName,
    source: `${filingLabel(source)}${promise.sourcePage ? `, page ${promise.sourcePage}` : ""}`,
    speaker: promise.speaker,

    statement: promise.statement,
    metric: promise.metric,
    targetValue: promise.targetValue,

    deadline: promise.deadline ? describeDeadline(promise.deadline) : null,
    deadlineReported,
    pages,
  });

  const verdict = await askForVerdict(userPrompt);
  if (!verdict) return null;

  // Step 6: map the page ref back to a filing + page number.
  const cited = pages.find((page) => page.ref === verdict.ref);

  return {
    promiseId: promise.id,
    status: verdict.status,
    evidence: verdict.evidence,

    checkedAgainstFilingId: cited?.filingId ?? null,
    evidencePage: cited?.pageNumber ?? null,
  };
}

function pendingCheck(promiseId: string, evidence: string): NewPromiseCheck {
  return { promiseId, status: "pending", evidence };
}

type PageKey = { filingId: string; pageNumber: number };

/** The first `count` distinct pages among close-enough chunks, nearest first. */
function topPages(matches: ChunkMatch[], count: number): PageKey[] {
  const seen = new Set<string>();
  const pages: PageKey[] = [];

  for (const match of matches) {
    const key = `${match.filingId}:${match.pageNumber}`;
    if (match.distance > MAX_DISTANCE || seen.has(key)) continue;

    seen.add(key);
    pages.push({ filingId: match.filingId, pageNumber: match.pageNumber });
    if (pages.length === count) break;
  }

  return pages;
}

/** Full page text for each key, labelled for the prompt, in the order given. */
async function loadPages(
  keys: PageKey[],
  companyFilings: Filing[],
  timing: Map<string, Timing>,
): Promise<(CheckPromptPage & { filingId: string })[]> {
  if (keys.length === 0) return [];

  const rows = await db
    .select()
    .from(documentPages)
    .where(
      or(
        ...keys.map((key) =>
          and(
            eq(documentPages.filingId, key.filingId),
            eq(documentPages.pageNumber, key.pageNumber),
          ),
        ),
      ),
    );

  return keys.flatMap((key, i) => {
    const row = rows.find(
      (page) => page.filingId === key.filingId && page.pageNumber === key.pageNumber,
    );
    const filing = companyFilings.find((candidate) => candidate.id === key.filingId);

    if (!row || !filing) return [];

    return [
      {
        ref: i + 1,
        filingId: key.filingId,
        filing: filingLabel(filing),

        timing: timing.get(key.filingId) ?? "after deadline",
        pageNumber: key.pageNumber,
        text: row.text,
      },
    ];
  });
}

async function askForVerdict(userPrompt: string): Promise<z.infer<typeof verdictSchema> | null> {
  const completion = await callLLM(
    {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: CHECK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],

      response_format: { type: "json_object" },
      temperature: 0,
      reasoning: { enabled: false },
    },
    { purpose: "check_promises" },
  );

  const content = completion.choices[0]?.message.content;

  try {
    return verdictSchema.parse(JSON.parse(content ?? ""));
  } catch {
    // Skip this promise instead of failing the whole run; the next run retries it.
    console.warn("[checkPromises] dropped unreadable verdict", content);
    return null;
  }
}

/** Latest check status per promise. */
async function getLatestStatuses(promiseIds: string[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (promiseIds.length === 0) return latest;

  const checks = await db
    .select({ promiseId: promiseChecks.promiseId, status: promiseChecks.status })
    .from(promiseChecks)
    .where(inArray(promiseChecks.promiseId, promiseIds))
    .orderBy(desc(promiseChecks.checkedAt));

  // Newest first, so the first status seen for a promise is its latest.
  for (const check of checks) {
    if (!latest.has(check.promiseId)) latest.set(check.promiseId, check.status);
  }

  return latest;
}

/** "Q2 FY27 results" */
function filingLabel(filing: Filing): string {
  return `${formatPeriod(filing.fiscalYear, filing.fiscalQuarter)} ${filing.type}`;
}

/** "2026-09-30 (Q2 FY27)" */
function describeDeadline(deadline: string): string {
  const period = dateToPeriod(deadline);
  return `${deadline} (${formatPeriod(period.fy, period.quarter)})`;
}
