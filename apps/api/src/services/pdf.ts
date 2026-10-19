import { PDFParse } from "pdf-parse";

export interface PageText {
  pageNumber: number;
  text: string;
}

export class PdfParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfParseError";
  }
}

export function looksLikePdf(data: Uint8Array): boolean {
  // "%PDF-" magic bytes
  return (
    data.length > 5 &&
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46 &&
    data[4] === 0x2d
  );
}

/** Extracts text per page (1-indexed) from a digital PDF held in memory. No OCR. */
export async function extractPageTexts(data: Buffer): Promise<PageText[]> {
  // pdf.js may transfer/detach the buffer it is given, so hand it a copy.
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => ({ pageNumber: p.num, text: p.text.trim() }));
  } catch (err) {
    throw new PdfParseError("Could not read PDF text", { cause: err });
  } finally {
    await parser.destroy();
  }
}
