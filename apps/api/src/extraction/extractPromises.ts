import type { NewPromise } from "@boardroom/db";

/**
 * Extract management promises/guidance from a processed filing
 * (its `document_pages` / `chunks` are already in the database).
 *
 * The caller (the extract-promises job) inserts whatever this returns into `promises`.
 */
export async function extractPromises(filingId: string): Promise<NewPromise[]> {
  void filingId;
  throw new Error("TODO(HAYAT): implement");
}
