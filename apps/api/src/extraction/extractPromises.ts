import type { NewPromise } from "@boardroom/db";
import { companies, documentPages, filings } from "@boardroom/db";
import { asc, eq } from "@boardroom/db/orm";
import { z } from "zod";
import { db } from "../db";
import { callLLM, DEFAULT_MODEL } from "../llm/llm";
import { buildPromiseUserPrompt, PROMISE_SYSTEM_PROMPT } from "./prompts";

/** Pages per LLM call. Transcript pages are ~3-4k chars, so 4 pages stays well within context. */
const PAGES_PER_BATCH = 4;
/** How much of the previous page to show as context (enough to catch the last speaker label). */
const CONTEXT_CHARS = 1500;

const MAX_OUTPUT_TOKENS = 10000;

const extractedSchema = z.object({
  statement: z.string().min(1),
  speaker: z.string().nullish(),
  metric: z.string().nullish(),

  targetValue: z.string().nullish(),
  deadline: z.iso.date().nullish().catch(null),
  page: z.number().int().nullish(),
});

const responseSchema = z.object({ promises: z.array(z.unknown()) });

type Extracted = z.infer<typeof extractedSchema>;

/**
 *
 *  This function used in the extraction of promises in job queues
 */
export async function extractPromises(filingId: string): Promise<NewPromise[]> {
  console.log("Extracting Promises started");
  const [filing] = await db
    .select({
      companyId: filings.companyId,
      title: filings.title,
      filedAt: filings.filedAt,
      companyName: companies.name,
    })
    .from(filings)
    .innerJoin(companies, eq(companies.id, filings.companyId))
    .where(eq(filings.id, filingId));

  if (!filing) throw new Error(`Filing ${filingId} not found`);

  const pages = await db
    .select({ pageNumber: documentPages.pageNumber, text: documentPages.text })
    .from(documentPages)
    .where(eq(documentPages.filingId, filingId))
    .orderBy(asc(documentPages.pageNumber));

  const pageNumbers = new Set(pages.map((page) => page.pageNumber));
  const seen = new Set<string>();
  const results: NewPromise[] = [];

  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    const batch = pages.slice(i, i + PAGES_PER_BATCH);
    const previousPage = pages[i - 1];

    const userPrompt = buildPromiseUserPrompt({
      companyName: filing.companyName,
      filingTitle: filing.title,
      filedAt: filing.filedAt?.toISOString().slice(0, 10) ?? null,

      pages: batch,
      context: previousPage ? previousPage.text.slice(-CONTEXT_CHARS) : null,
    });

    for (const item of await extractBatch(userPrompt)) {
      console.log("Item found", item.statement);
      const key = normalize(item.statement);
      if (seen.has(key)) continue;

      seen.add(key);
      const page = item.page != null && pageNumbers.has(item.page) ? item.page : null;

      results.push({
        companyId: filing.companyId,
        sourceFilingId: filingId,
        sourcePage: page,

        speaker: item.speaker ?? null,
        statement: item.statement.trim(),
        metric: item.metric ?? null,

        targetValue: item.targetValue ?? null,
        deadline: item.deadline ?? null,
      });
    }
  }

  return results;
}

async function extractBatch(userPrompt: string): Promise<Extracted[]> {
  const completion = await callLLM(
    {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: PROMISE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],

      response_format: { type: "json_object" },
      temperature: 0,
      // max_completion_tokens: MAX_OUTPUT_TOKENS,
    },
    { purpose: "extract_promises" },
  );

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length")
    throw new Error("Promise extraction hit the output token limit");

  const content = choice?.message.content;
  if (!content) throw new Error("LLM returned an empty response");

  const { promises } = responseSchema.parse(JSON.parse(content));

  // Skip malformed items instead of failing the whole batch.
  return promises.flatMap((raw) => {
    const parsed = extractedSchema.safeParse(raw);
    if (!parsed.success) console.warn("[extractPromises] dropped malformed item", raw);

    return parsed.success ? [parsed.data] : [];
  });
}

/** Same statement with different spacing/punctuation counts as a duplicate. */
function normalize(statement: string): string {
  return statement
    .toLowerCase()
    .replace(/[^a-z0-9₹%.]+/g, " ")
    .trim();
}
