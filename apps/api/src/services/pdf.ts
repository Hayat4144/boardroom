import { availableParallelism } from "node:os";
import { PDFParse } from "pdf-parse";
import { createScheduler, createWorker, type Scheduler } from "tesseract.js";
import { httpError } from "../http";

export type PageText = { pageNumber: number; text: string };

// Pages with less text than this are treated as scanned and sent to OCR.
const MIN_TEXT_LENGTH = 20;

// How many tesseract workers to run, and how many pages to render at once.
// Rendering is capped so a big scanned PDF doesn't hold every page image in memory.
const OCR_WORKERS = Math.min(4, availableParallelism());

const RENDER_CONCURRENCY = OCR_WORKERS * 2;

// Created once on first use and reused by every PDF after that.
let ocrScheduler: Promise<Scheduler> | undefined;

/** Checks the "%PDF-" magic bytes at the start of the file. */
export function isPdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Returns the shared OCR scheduler, starting its workers the first time it is called. */
function getOcrScheduler(): Promise<Scheduler> {
  ocrScheduler ??= startOcrScheduler();

  return ocrScheduler;
}

async function startOcrScheduler(): Promise<Scheduler> {
  const scheduler = createScheduler();
  const workers = await Promise.all(Array.from({ length: OCR_WORKERS }, () => createWorker("eng")));

  workers.forEach((worker) => scheduler.addWorker(worker));
  console.log(`OCR ready with ${workers.length} workers`);

  return scheduler;
}

/** Stops the OCR workers (for shutdown and tests). The next OCR call starts them again. */
export async function stopOcr(): Promise<void> {
  if (!ocrScheduler) return;

  const scheduler = await ocrScheduler;
  ocrScheduler = undefined;
  await scheduler.terminate();
}

/** Runs fn over items with at most `limit` running at the same time, keeping input order. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runner() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));

  return results;
}

/** Renders one page to a PNG and OCRs it. Returns empty text if the page can't be rendered or is blank. */
async function ocrPage(parser: PDFParse, pageNumber: number): Promise<PageText> {
  const screenshot = await parser.getScreenshot({
    partial: [pageNumber],
    desiredWidth: 1500,
    imageBuffer: true,
    imageDataUrl: false,
  });

  const image = screenshot.pages[0]?.data;

  if (!image?.length) {
    console.warn(`Could not render page ${pageNumber}`);
    return { pageNumber, text: "" };
  }

  const scheduler = await getOcrScheduler();
  const { data } = await scheduler.addJob("recognize", Buffer.from(image));
  const text = data.text.trim();

  // Blank scans come back as stray symbols like "/"; keep only output with real characters.
  return { pageNumber, text: /[\p{L}\p{N}]/u.test(text) ? text : "" };
}

/**
 * Extracts text per page (1-indexed) from a PDF held in memory.
 * Digital pages use the embedded text; near-empty (scanned) pages are rendered and OCR'd in parallel.
 */
export async function readPdfPages(data: Buffer): Promise<PageText[]> {
  const parser = new PDFParse({ data: new Uint8Array(data) });

  try {
    const result = await parser.getText();
    const scannedPages = result.pages.filter((page) => page.text.trim().length < MIN_TEXT_LENGTH);

    const textPages: PageText[] = result.pages
      .filter((page) => page.text.trim().length >= MIN_TEXT_LENGTH)
      .map((page) => ({ pageNumber: page.num, text: page.text.trim() }));

    if (scannedPages.length === 0) return textPages;

    console.log(`OCR on ${scannedPages.length} of ${result.pages.length} pages`);

    const ocrPages = await mapWithLimit(scannedPages, RENDER_CONCURRENCY, (page) => ocrPage(parser, page.num));

    return [...textPages, ...ocrPages].sort((a, b) => a.pageNumber - b.pageNumber);
  } catch {
    throw httpError(422, "invalid_pdf", "Could not read PDF text");
  } finally {
    await parser.destroy();
  }
}
