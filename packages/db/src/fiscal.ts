// Indian fiscal periods. FY26 = Apr 2025 – Mar 2026; Q1 = Apr–Jun … Q4 = Jan–Mar.
// No imports on purpose: the web app uses these too (via "@boardroom/db/fiscal").

export const FILING_TYPES = ["transcript", "presentation", "results", "other"] as const;
export type FilingType = (typeof FILING_TYPES)[number];

export type Period = { fy: number; quarter: number | null };

// Used to build default filing titles, e.g. "Ambuja Cements Ltd Q3 FY26 earnings call transcript".
const TITLE_SUFFIX: Record<FilingType, string> = {
  transcript: "earnings call transcript",
  presentation: "investor presentation",

  results: "results",
  other: "filing",
};

// Words accepted for each type in file names ("ppt" and "result" are common shorthands).
const TYPE_ALIASES: Record<string, FilingType> = {
  transcript: "transcript",
  presentation: "presentation",
  ppt: "presentation",

  results: "results",
  result: "results",
  other: "other",
};

/** "Q3FY26" | "Q3 FY26" | "q3-fy26" | "FY26" → { fy: 26, quarter: 3 | null }; anything else → null. */
export function parsePeriod(input: string): Period | null {
  const match = /^(?:Q([1-4])[\s_-]*)?FY[\s_-]*(\d{2})$/i.exec(input.trim());
  if (!match) return null;

  return { fy: Number(match[2]), quarter: match[1] ? Number(match[1]) : null };
}

/** (26, 3) → "Q3 FY26"; (26, null) → "FY26". */
export function formatPeriod(fy: number, quarter: number | null): string {
  const year = `FY${String(fy).padStart(2, "0")}`;
  return quarter ? `Q${quarter} ${year}` : year;
}

/** Sort comparator, oldest → newest. A whole-year period sorts after that year's Q4. */
export function comparePeriods(a: Period, b: Period): number {
  return a.fy - b.fy || (a.quarter ?? 5) - (b.quarter ?? 5);
}

/** "2026-09-30" → { fy: 27, quarter: 2 }. April starts a new fiscal year. */
export function dateToPeriod(date: string): { fy: number; quarter: number } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));

  if (!year || !(month >= 1 && month <= 12)) throw new Error(`Invalid date: ${date}`);

  // Apr–Jun = Q1, Jul–Sep = Q2, Oct–Dec = Q3, Jan–Mar = Q4 (of the year that started last April).
  const quarter = month >= 4 ? Math.ceil((month - 3) / 3) : 4;
  const fy = (month >= 4 ? year + 1 : year) % 100;

  return { fy, quarter };
}

/** "AMBUJACEM_Q3FY26_transcript.pdf" → { symbol, fy, quarter, type }; null if it doesn't fit. */
export function parseFilingFileName(
  fileName: string,
): { symbol: string; fy: number; quarter: number; type: FilingType } | null {
  const parts = fileName.replace(/\.pdf$/i, "").split("_");
  if (parts.length !== 3) return null;

  const [symbol, periodText, typeText] = parts as [string, string, string];
  const period = parsePeriod(periodText);
  const type = TYPE_ALIASES[typeText.toLowerCase()];

  if (!symbol || !period?.quarter || !type) return null;

  return { symbol: symbol.toUpperCase(), fy: period.fy, quarter: period.quarter, type };
}

/** Default title when the uploader leaves it empty. */
export function filingTitle(companyName: string, fy: number, quarter: number, type: FilingType) {
  return `${companyName} ${formatPeriod(fy, quarter)} ${TITLE_SUFFIX[type]}`;
}
