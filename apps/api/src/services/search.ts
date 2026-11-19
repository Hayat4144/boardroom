import { chunks, filings } from "@boardroom/db";
import { and, asc, cosineDistance, eq, inArray, isNotNull, isNull } from "@boardroom/db/orm";
import { db } from "../db";
import { embedTexts } from "./embeddings";

/** Chunks embedded per model run (keeps memory use flat on big filings). */
const EMBED_BATCH_SIZE = 32;

/** Fills in the missing embeddings of a filing's chunks. Returns how many it embedded. */
export async function embedFilingChunks(filingId: string): Promise<number> {
  const rows = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .where(and(eq(chunks.filingId, filingId), isNull(chunks.embedding)))
    .orderBy(asc(chunks.pageNumber));

  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedTexts(batch.map((row) => row.content));

    await db.transaction(async (tx) => {
      for (const [j, row] of batch.entries()) {
        await tx.update(chunks).set({ embedding: vectors[j] }).where(eq(chunks.id, row.id));
      }
    });
  }

  return rows.length;
}

export type ChunkMatch = {
  chunkId: string;
  filingId: string;
  pageNumber: number;

  content: string;
  /** Cosine distance: 0 = same meaning, 1 = unrelated (up to 2 = opposite). */
  distance: number;
};

export type SearchOptions = {
  /** Search only this company's filings. */
  companyId?: string;
  /** Search only these filings (e.g. the buckets from findEvidenceFilings). */
  filingIds?: string[];

  /** How many chunks to return, closest first. Default 8. */
  limit?: number;
};

/**
 * The chunks closest in meaning to `query`, nearest first. Only chunks that
 * have an embedding are searched. The query is embedded locally, like the chunks.
 */
export async function searchChunks(query: string, options: SearchOptions): Promise<ChunkMatch[]> {
  const { companyId, filingIds, limit = 8 } = options;
  if (filingIds?.length === 0) return [];

  const [queryVector] = await embedTexts([query]);
  const distance = cosineDistance(chunks.embedding, queryVector!).mapWith(Number);

  return db
    .select({
      chunkId: chunks.id,
      filingId: chunks.filingId,
      pageNumber: chunks.pageNumber,
      content: chunks.content,
      distance,
    })
    .from(chunks)
    .innerJoin(filings, eq(filings.id, chunks.filingId))
    .where(
      and(
        isNotNull(chunks.embedding),
        companyId ? eq(filings.companyId, companyId) : undefined,
        filingIds ? inArray(chunks.filingId, filingIds) : undefined,
      ),
    )
    .orderBy(distance)
    .limit(limit);
}
