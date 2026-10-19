/**
 * Splits one page's text into overlapping chunks for retrieval.
 *
 * Deliberately simple and deterministic: chunks never cross a page boundary
 * (so every chunk keeps an exact page number for citations) and prefer to
 * break at paragraph, line, sentence, then word boundaries. Replace freely if
 * retrieval experiments call for something smarter.
 */
export interface ChunkOptions {
  maxChars: number;
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 1500, overlapChars: 200 };

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
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Look for a natural break in the second half of the window.
      const window = text.slice(start + Math.floor(maxChars / 2), end);
      for (const br of BREAKS) {
        const idx = window.lastIndexOf(br);
        if (idx !== -1) {
          end = start + Math.floor(maxChars / 2) + idx + br.length;
          break;
        }
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    // Step back for overlap, then forward to a word start so chunks don't begin mid-word.
    let next = Math.max(end - overlapChars, start + 1);
    while (next < end && !/\s/.test(text[next - 1] ?? " ")) next++;
    start = next;
  }
  return chunks;
}
