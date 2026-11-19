import { comparePeriods, filings, formatPeriod, type Period } from "@boardroom/db";
import { db } from "../db";
import { eq } from "@boardroom/db/orm";
import { searchChunks, type ChunkMatch } from "../services/search";
import { callLLM, DEFAULT_MODEL } from "../llm/llm";
import {
  ASK_SYSTEM_PROMPT,
  buildAskUserPrompt,
  type AskPromptExcerpt,
} from "../extraction/prompts";
import z from "zod";

/** Chunks from the whole company, and from filings of a period the question names. */
const GENERAL_LIMIT = 6;
const PERIOD_LIMIT = 6;

/** Most excerpts sent to the LLM after merging both searches. */
const MAX_EXCERPTS = 8;
/** Chunks further than this (cosine distance) are about something else. Same as checkPromises. */
const MAX_DISTANCE = 0.75;

/**
 * Users ask in plain words; filings use finance terms. Adding the terms to the
 * search query (not to the question the LLM sees) pulls in the right chunks.
 * "much margin the company earn" ranked the answer 10th; with "EBITDA" it ranked 2nd.
 */
const SEARCH_TERMS: [RegExp, string][] = [
  [/\bmargins?\b/i, "EBITDA margin EBITDA per tonne"],
  [/\b(profit|earn|earnings|income)\b/i, "PAT profit after tax EBITDA"],
  [/\b(revenue|sales|turnover)\b/i, "revenue from operations sales volume"],

  [/\b(debt|borrowing|leverage)\b/i, "net debt cash balance"],
  [/\bcapacity\b/i, "capacity MTPA commissioning"],
  [/\b(costs?|expenses?)\b/i, "cost per tonne"],

  [/\bcapex\b/i, "capital expenditure capex"],
];

/** "last quarter", "latest quarter", "this quarter", "recent quarter", "previous quarter". */
const RELATIVE_QUARTER = /\b(last|latest|this|current|recent|previous|most recent)\s+quarter\b/i;
/** "last year", "this fiscal", "latest FY". */
const RELATIVE_YEAR = /\b(last|latest|this|current|recent|previous)\s+(year|fiscal|fy)\b/i;

const answerSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(
    z.object({
      ref: z.number().int(),
      quote: z.string().min(1),
    }),
  ),
});

type CompanyFiling = {
  id: string;
  type: string;
  fiscalYear: number;

  fiscalQuarter: number;
};

/**
 * Answer a question about one company using its filings, with page-level citations.
 *
 * The caller (POST /api/companies/:id/ask) stores the result in `questions`.
 */
export async function answerQuestion(
  company: { companyId: string; companyName: string },
  question: string,
): Promise<{
  answer: string;
  citations: { filingId: string; page: number; quote: string }[];
}> {
  const { companyId, companyName } = company;
  const companyFilings = await db
    .select({
      id: filings.id,
      type: filings.type,
      fiscalYear: filings.fiscalYear,

      fiscalQuarter: filings.fiscalQuarter,
    })
    .from(filings)
    .where(eq(filings.companyId, companyId));

  const latest = latestPeriod(companyFilings);

  // "FY25" or "last quarter" in the question: semantic search can't filter by period,
  // so search those filings separately.
  const periods = findPeriods(question, latest);
  const periodFilingIds = companyFilings
    .filter((filing) => periods.some((period) => inPeriod(filing, period)))
    .map((filing) => filing.id);

  const query = searchQuery(question);
  const [periodMatches, generalMatches] = await Promise.all([
    periods.length > 0
      ? searchChunks(query, { filingIds: periodFilingIds, limit: PERIOD_LIMIT })
      : Promise.resolve([]),
    searchChunks(query, { companyId, limit: GENERAL_LIMIT }),
  ]);

  // filingId stays here for the ref → filing lookup; buildAskUserPrompt never sends it to the LLM.
  const excerpts = toExcerpts([...periodMatches, ...generalMatches], companyFilings);
  const userPrompt = buildAskUserPrompt({
    companyName,
    question,
    excerpts,
    latestPeriod: latest ? formatPeriod(latest.fy, latest.quarter) : null,
  });

  const completion = await callLLM(
    {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: ASK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],

      response_format: { type: "json_object" },
      temperature: 0,
      reasoning: { enabled: false },
      max_completion_tokens: 1500,
    },
    { purpose: "ask" },
  );

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") throw new Error("Answer hit the output token limit");

  const content = choice?.message.content;
  if (!content) throw new Error("LLM returned an empty response");

  const answer = answerSchema.safeParse(JSON.parse(content));
  if (!answer.success) throw new Error("LLM answer did not match the expected shape");

  const seen = new Set<string>();
  const citations = answer.data.citations.flatMap((citation) => {
    const excerpt = excerpts.find((e) => e.ref === citation.ref);
    const key = `${citation.ref}:${citation.quote}`;

    // Drop made-up refs, repeats, and quotes that aren't really in the excerpt.
    if (!excerpt || seen.has(key) || !containsQuote(excerpt.text, citation.quote)) return [];
    seen.add(key);

    return [{ filingId: excerpt.filingId, page: excerpt.pageNumber, quote: citation.quote }];
  });

  return { answer: answer.data.answer, citations };
}

/** Nearest first, no repeats, only close-enough chunks, numbered 1..n with no gaps. */
function toExcerpts(
  matches: ChunkMatch[],
  companyFilings: CompanyFiling[],
): (AskPromptExcerpt & { filingId: string })[] {
  const byDistance = [...matches].sort((a, b) => a.distance - b.distance);
  const seen = new Set<string>();
  const excerpts: (AskPromptExcerpt & { filingId: string })[] = [];

  for (const match of byDistance) {
    const filing = companyFilings.find((item) => item.id === match.filingId);
    if (!filing || match.distance > MAX_DISTANCE || seen.has(match.chunkId)) continue;

    seen.add(match.chunkId);
    excerpts.push({
      ref: excerpts.length + 1,
      filingId: match.filingId,

      // "Q4 FY25 transcript": the period tells the LLM when it was said.
      filing: `${formatPeriod(filing.fiscalYear, filing.fiscalQuarter)} ${filing.type}`,
      pageNumber: match.pageNumber,
      text: match.content,
    });

    if (excerpts.length === MAX_EXCERPTS) break;
  }

  return excerpts;
}

/** Question plus the finance terms its plain words map to. */
function searchQuery(question: string): string {
  const extra = SEARCH_TERMS.filter(([pattern]) => pattern.test(question)).map(
    ([, terms]) => terms,
  );
  return [question, ...extra].join(" ");
}

/** The newest quarter among the company's filings, or null if it has none. */
function latestPeriod(companyFilings: CompanyFiling[]): Period | null {
  let latest: Period | null = null;

  for (const filing of companyFilings) {
    const period = { fy: filing.fiscalYear, quarter: filing.fiscalQuarter };
    if (!latest || comparePeriods(period, latest) > 0) latest = period;
  }

  return latest;
}

/**
 * Every "FY25", "Q3 FY26", "FY2025" in the question → { fy, quarter }.
 * "Last quarter" / "this year" resolve against the latest filing's period.
 */
function findPeriods(question: string, latest: Period | null): Period[] {
  const matches = question.matchAll(/\b(?:Q([1-4])\s*)?FY\s*'?(\d{4}|\d{2})\b/gi);
  const periods: Period[] = [...matches].map((match) => ({
    fy: Number(match[2]) % 100,
    quarter: match[1] ? Number(match[1]) : null,
  }));

  if (latest && RELATIVE_QUARTER.test(question)) periods.push(latest);
  if (latest && RELATIVE_YEAR.test(question)) periods.push({ fy: latest.fy, quarter: null });

  return periods;
}

/** A whole-year period matches all four quarters' filings. */
function inPeriod(filing: CompanyFiling, period: Period): boolean {
  if (filing.fiscalYear !== period.fy) return false;
  return period.quarter === null || filing.fiscalQuarter === period.quarter;
}

/** PDF text has broken lines and odd spacing, so compare with whitespace collapsed. */
function containsQuote(text: string, quote: string): boolean {
  const squash = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  return squash(text).includes(squash(quote));
}
