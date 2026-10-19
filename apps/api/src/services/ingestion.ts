import { randomUUID } from "node:crypto";
import {
  chunks,
  documentPages,
  filings,
  type Database,
  type Filing,
  type NewChunk,
} from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import type { Jobs } from "../jobs";
import { HttpError, notFound } from "../lib/http";
import { chunkText } from "./chunking";
import { extractPageTexts, looksLikePdf, PdfParseError } from "./pdf";
import { filingObjectKey, streamToBuffer, type Storage } from "./storage";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const INSERT_BATCH = 500;

export interface UploadFilingInput {
  companyId: string;
  data: Buffer;
  title: string;
  category?: string;
  filedAt?: Date;
  url?: string;
  uploadedBy: string;
}

/** Stores the PDF in S3, then records the filing (status "new"). */
export async function uploadFiling(
  { db, storage }: { db: Database; storage: Storage },
  input: UploadFilingInput,
): Promise<Filing> {
  if (!looksLikePdf(input.data)) {
    throw new HttpError(400, "invalid_file", "File is not a PDF");
  }
  const id = randomUUID();
  const storageKey = filingObjectKey(input.companyId, id);
  await storage.put(storageKey, input.data, "application/pdf");
  try {
    const [filing] = await db
      .insert(filings)
      .values({
        id,
        companyId: input.companyId,
        source: "manual",
        category: input.category,
        title: input.title,
        filedAt: input.filedAt,
        url: input.url,
        storageKey,
        status: "new",
        uploadedBy: input.uploadedBy,
      })
      .returning();
    return filing!;
  } catch (err) {
    // Don't leave an orphaned object behind.
    await storage.delete(storageKey).catch(() => undefined);
    if (isUniqueViolation(err)) {
      throw new HttpError(409, "duplicate_filing", "A filing with this URL already exists");
    }
    throw err;
  }
}

export interface ProcessResult {
  filingId: string;
  pages: number;
  chunks: number;
  extractionJobId: string | null;
}

/**
 * Streams the PDF from S3 into memory, extracts per-page text, replaces the
 * filing's document_pages + chunks, marks it processed and enqueues promise
 * extraction. Nothing is written to local disk. On failure the filing is
 * marked "failed".
 */
export async function processFiling(
  {
    db,
    storage,
    jobs,
  }: { db: Database; storage: Storage; jobs: Pick<Jobs, "enqueueExtractPromises"> },
  filingId: string,
): Promise<ProcessResult> {
  const [filing] = await db.select().from(filings).where(eq(filings.id, filingId));
  if (!filing) throw notFound("Filing");
  if (!filing.storageKey) throw new HttpError(409, "no_file", "Filing has no stored PDF");

  try {
    const data = await streamToBuffer(await storage.getStream(filing.storageKey), MAX_PDF_BYTES);
    const pages = await extractPageTexts(data);
    if (!pages.some((p) => p.text.length > 0)) {
      throw new HttpError(
        422,
        "no_text",
        "No text found in this PDF (scanned PDFs need OCR, which isn't supported yet)",
      );
    }

    const chunkRows: NewChunk[] = pages.flatMap((p) =>
      chunkText(p.text).map((content) => ({ filingId, pageNumber: p.pageNumber, content })),
    );

    await db.transaction(async (tx) => {
      // Re-processing replaces previous output.
      await tx.delete(chunks).where(eq(chunks.filingId, filingId));
      await tx.delete(documentPages).where(eq(documentPages.filingId, filingId));
      for (const batch of batches(pages, INSERT_BATCH)) {
        await tx
          .insert(documentPages)
          .values(batch.map((p) => ({ filingId, pageNumber: p.pageNumber, text: p.text })));
      }
      for (const batch of batches(chunkRows, INSERT_BATCH)) {
        await tx.insert(chunks).values(batch);
      }
      await tx.update(filings).set({ status: "processed" }).where(eq(filings.id, filingId));
    });

    const extractionJobId = await jobs.enqueueExtractPromises(filingId);
    return { filingId, pages: pages.length, chunks: chunkRows.length, extractionJobId };
  } catch (err) {
    await db.update(filings).set({ status: "failed" }).where(eq(filings.id, filingId));
    if (err instanceof PdfParseError) throw new HttpError(422, "invalid_pdf", err.message);
    throw err;
  }
}

function* batches<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
