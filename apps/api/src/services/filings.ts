import { randomUUID } from "node:crypto";
import { chunks, documentPages, filings, type Filing } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { db } from "../db";
import { httpError, notFound } from "../http";
import { enqueueExtractPromises } from "../jobs/jobs";
import { chunkText } from "./chunking";
import { isPdf, readPdfPages } from "./pdf";
import { deleteFile, downloadFile, filingKey, uploadFile } from "./storage";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export type UploadFilingInput = {
  companyId: string;
  data: Buffer;
  uploadedBy: string;

  title: string;
  category?: string;
  filedAt?: Date;

  url?: string;
};

/** Stores the PDF in S3, then records the filing with status "new". */
export async function uploadFiling(input: UploadFilingInput): Promise<Filing> {
  if (!isPdf(input.data)) throw httpError(400, "invalid_file", "File is not a PDF");

  const id = randomUUID();
  const storageKey = filingKey(input.companyId, id);
  await uploadFile(storageKey, input.data, "application/pdf");

  try {
    const [filing] = await db
      .insert(filings)
      .values({
        id,
        companyId: input.companyId,
        source: "manual",

        title: input.title,
        category: input.category,
        filedAt: input.filedAt,

        url: input.url,
        storageKey,
        status: "new",

        uploadedBy: input.uploadedBy,
      })
      .returning();

    return filing!;
  } catch (err) {
    // Don't leave an orphaned file behind.
    await deleteFile(storageKey).catch(() => undefined);

    if (isUniqueViolation(err)) {
      throw httpError(409, "duplicate_filing", "A filing with this URL already exists");
    }

    throw err;
  }
}

export type ProcessResult = {
  filingId: string;
  pages: number;
  chunks: number;

  extractionJobId: string | null;
};

/**
 * Downloads the PDF from S3 into memory, saves its page text and chunks
 * (replacing earlier ones), marks the filing processed and queues promise
 * extraction. On any failure the filing is marked "failed".
 */
export async function processFiling(filingId: string): Promise<ProcessResult> {
  const storageKey = await getStorageKey(filingId);

  try {
    const pages = await readPdfPages(await downloadFile(storageKey));
    const hasText = pages.some((page) => page.text.length > 0);
    if (!hasText) throw noTextError();

    const chunkRows = pages.flatMap((page) =>
      chunkText(page.text).map((content) => ({ filingId, pageNumber: page.pageNumber, content })),
    );

    await db.transaction(async (tx) => {
      await tx.delete(chunks).where(eq(chunks.filingId, filingId));
      await tx.delete(documentPages).where(eq(documentPages.filingId, filingId));
      await tx.insert(documentPages).values(pages.map((page) => ({ filingId, ...page })));

      if (chunkRows.length > 0) await tx.insert(chunks).values(chunkRows);
      await tx.update(filings).set({ status: "processed" }).where(eq(filings.id, filingId));
    });

    const extractionJobId = await enqueueExtractPromises(filingId);
    return { filingId, pages: pages.length, chunks: chunkRows.length, extractionJobId };
  } catch (err) {
    await db.update(filings).set({ status: "failed" }).where(eq(filings.id, filingId));
    throw err;
  }
}

/** The S3 key of a filing's PDF; 404 for an unknown filing, 409 when it has no file. */
export async function getStorageKey(filingId: string): Promise<string> {
  const [filing] = await db
    .select({ storageKey: filings.storageKey })
    .from(filings)
    .where(eq(filings.id, filingId));

  if (!filing) throw notFound("Filing");
  if (!filing.storageKey) throw httpError(409, "no_file", "Filing has no stored PDF");

  return filing.storageKey;
}

function noTextError() {
  const message = "No text found in this PDF (scanned PDFs need OCR, which isn't supported yet)";
  return httpError(422, "no_text", message);
}

/** Postgres error 23505, possibly wrapped by Drizzle in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
