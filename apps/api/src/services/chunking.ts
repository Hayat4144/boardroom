/**
 * Splits one page's text into overlapping chunks for retrieval.
 *
 * Chunks never cross a page boundary (so every chunk keeps an exact page
 * number for citations) and prefer to break at paragraph, line, sentence,
 * then word boundaries. Replace freely if retrieval experiments need more.
 */
export type ChunkOptions = { maxChars: number; overlapChars: number };

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 1000, overlapChars: 200 };

const BREAKS = ["\n\n", "\n", ". ", " "];

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(raw: string, options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): string[] {
  const { maxChars, overlapChars } = options;
  if (overlapChars >= maxChars) throw new Error("overlapChars must be smaller than maxChars");

  const text = normalizeText(raw);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = findChunkEnd(text, start, maxChars);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= text.length) break;

    start = findNextStart(text, start, end, overlapChars);
  }

  return chunks;
}

/** End of the chunk starting at `start`: a natural break in the second half of the window. */
function findChunkEnd(text: string, start: number, maxChars: number): number {
  const end = Math.min(start + maxChars, text.length);
  if (end === text.length) return end;

  const windowStart = start + Math.floor(maxChars / 2);
  const window = text.slice(windowStart, end);

  for (const br of BREAKS) {
    const index = window.lastIndexOf(br);
    if (index !== -1) return windowStart + index + br.length;
  }

  return end;
}

/** Steps back for overlap, then forward to a word start so chunks don't begin mid-word. */
function findNextStart(text: string, start: number, end: number, overlapChars: number): number {
  let next = Math.max(end - overlapChars, start + 1);
  while (next < end && !/\s/.test(text[next - 1] ?? " ")) next++;

  return next;
}
