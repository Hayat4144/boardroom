import type { Filing, FilingType } from "@boardroom/db";
import { comparePeriods, dateToPeriod, type Period } from "@boardroom/db/fiscal";

/** Without a deadline, look this many quarters past the promise's source filing. */
const NO_DEADLINE_QUARTERS = 4;

/** Within one quarter: hard numbers first, then what management said. */
const TYPE_ORDER: FilingType[] = ["results", "transcript", "presentation", "other"];

export type EvidenceFiling = Pick<Filing, "id" | "type" | "fiscalYear" | "fiscalQuarter">;

export type EvidenceFilings = {
  /** After the source filing, before the deadline quarter: progress or early "delayed" signs. */
  before: EvidenceFiling[];
  /** Covering the deadline's quarter: the main kept / missed evidence. Empty = not reported yet. */
  deadlineQuarter: EvidenceFiling[];

  /** After the deadline quarter: late completion ("delayed") or confirmation. */
  after: EvidenceFiling[];
};

/**
 * Step 3 of checkPromises(): which of the company's filings can tell whether
 * this promise came true. Each bucket is sorted oldest → newest, results first
 * within a quarter. Pass only processed filings (they have pages to read).
 *
 * Promise without a deadline: everything goes in `after`, limited to the next
 * NO_DEADLINE_QUARTERS quarters.
 */
export function findEvidenceFilings(
  promise: { sourceFilingId: string; deadline: string | null },
  filings: EvidenceFiling[],
): EvidenceFilings {
  const source = filings.find((filing) => filing.id === promise.sourceFilingId);
  if (!source) throw new Error(`Source filing ${promise.sourceFilingId} is not in the list`);

  // Filings from the source's own quarter report on a period that is already over.
  const later = filings
    .filter((filing) => comparePeriods(periodOf(filing), periodOf(source)) > 0)
    .sort(byPeriodThenType);

  const result: EvidenceFilings = { before: [], deadlineQuarter: [], after: [] };

  if (!promise.deadline) {
    const lastQuarter = quarterIndex(periodOf(source)) + NO_DEADLINE_QUARTERS;
    result.after = later.filter((filing) => quarterIndex(periodOf(filing)) <= lastQuarter);

    return result;
  }

  const deadline = dateToPeriod(promise.deadline);

  for (const filing of later) {
    const order = comparePeriods(periodOf(filing), deadline);
    const bucket = order < 0 ? result.before : order === 0 ? result.deadlineQuarter : result.after;

    bucket.push(filing);
  }

  return result;
}

function periodOf(filing: EvidenceFiling): Period {
  return { fy: filing.fiscalYear, quarter: filing.fiscalQuarter };
}

/** Quarters counted from FY00 Q1, so "N quarters later" is plain addition. */
function quarterIndex(period: Period): number {
  return period.fy * 4 + (period.quarter ?? 4);
}

function byPeriodThenType(a: EvidenceFiling, b: EvidenceFiling): number {
  const byPeriod = comparePeriods(periodOf(a), periodOf(b));
  return byPeriod || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
}
