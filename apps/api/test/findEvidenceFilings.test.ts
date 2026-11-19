import { describe, expect, it } from "vitest";
import { findEvidenceFilings, type EvidenceFiling } from "../src/extraction/findEvidenceFilings";

// The example timeline: the promise is made in the Q4 FY26 call.
const filings: EvidenceFiling[] = [
  { id: "q3-results", type: "results", fiscalYear: 26, fiscalQuarter: 3 },
  { id: "q4-transcript", type: "transcript", fiscalYear: 26, fiscalQuarter: 4 },
  { id: "q4-results", type: "results", fiscalYear: 26, fiscalQuarter: 4 },

  { id: "q1-transcript", type: "transcript", fiscalYear: 27, fiscalQuarter: 1 },
  { id: "q2-transcript", type: "transcript", fiscalYear: 27, fiscalQuarter: 2 },
  { id: "q2-results", type: "results", fiscalYear: 27, fiscalQuarter: 2 },

  { id: "q3-transcript", type: "transcript", fiscalYear: 27, fiscalQuarter: 3 },
];

const ids = (list: EvidenceFiling[]) => list.map((filing) => filing.id);

describe("findEvidenceFilings", () => {
  it("splits later filings around the deadline quarter", () => {
    const promise = { sourceFilingId: "q4-transcript", deadline: "2026-09-30" };
    const result = findEvidenceFilings(promise, filings);

    expect(ids(result.before)).toEqual(["q1-transcript"]);
    expect(ids(result.deadlineQuarter)).toEqual(["q2-results", "q2-transcript"]);
    expect(ids(result.after)).toEqual(["q3-transcript"]);
  });

  it("ignores filings from the source quarter and earlier", () => {
    const promise = { sourceFilingId: "q4-transcript", deadline: "2027-03-31" };
    const all = Object.values(findEvidenceFilings(promise, filings)).flat();

    expect(ids(all)).not.toContain("q3-results");
    expect(ids(all)).not.toContain("q4-results");
  });

  it("leaves the deadline quarter empty when it is not reported yet", () => {
    const promise = { sourceFilingId: "q4-transcript", deadline: "2027-03-31" };
    const result = findEvidenceFilings(promise, filings);

    expect(result.deadlineQuarter).toEqual([]);
    expect(ids(result.before)).toEqual([
      "q1-transcript",
      "q2-results",
      "q2-transcript",
      "q3-transcript",
    ]);
    expect(result.after).toEqual([]);
  });

  it("without a deadline, looks at the next 4 quarters", () => {
    const promise = { sourceFilingId: "q3-results", deadline: null };
    const result = findEvidenceFilings(promise, filings);

    // Q4 FY26 … Q3 FY27 are the 4 quarters after Q3 FY26.
    expect(ids(result.after)).toEqual([
      "q4-results",
      "q4-transcript",
      "q1-transcript",

      "q2-results",
      "q2-transcript",
      "q3-transcript",
    ]);
    expect(result.before).toEqual([]);
  });

  it("throws when the source filing is missing", () => {
    const promise = { sourceFilingId: "nope", deadline: null };
    expect(() => findEvidenceFilings(promise, filings)).toThrow(/nope/);
  });
});
