import { PDFParse } from "pdf-parse";
import { httpError } from "../http";

export type PageText = { pageNumber: number; text: string };

/** Checks the "%PDF-" magic bytes at the start of the file. */
export function isPdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Extracts text per page (1-indexed) from a digital PDF held in memory. No OCR. */
export async function readPdfPages(data: Buffer): Promise<PageText[]> {
  // pdf.js may detach the buffer it is given, so hand it a copy.
  const parser = new PDFParse({ data: new Uint8Array(data) });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNumber: page.num, text: page.text.trim() }));
  } catch {
    throw httpError(422, "invalid_pdf", "Could not read PDF text");
  } finally {
    await parser.destroy();
  }
}
