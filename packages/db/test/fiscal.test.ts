import { describe, expect, it } from "vitest";
import {
  comparePeriods,
  dateToPeriod,
  filingTitle,
  formatPeriod,
  parseFilingFileName,
  parsePeriod,
} from "../src/fiscal";

describe("parsePeriod", () => {
  it("parses quarter + year in the common spellings", () => {
    expect(parsePeriod("Q3FY26")).toEqual({ fy: 26, quarter: 3 });
    expect(parsePeriod("Q3 FY26")).toEqual({ fy: 26, quarter: 3 });
    expect(parsePeriod(" q1-fy25 ")).toEqual({ fy: 25, quarter: 1 });
  });

  it("parses a whole fiscal year", () => {
    expect(parsePeriod("FY26")).toEqual({ fy: 26, quarter: null });
    expect(parsePeriod("FY00")).toEqual({ fy: 0, quarter: null });
  });

  it("rejects bad input", () => {
    const bad = ["", "Q3", "Q5FY26", "Q0FY26", "FY2026", "FY6", "Q3FY26x", "Q3 2026", "3FY26"];

    for (const input of bad) expect(parsePeriod(input), input).toBeNull();
  });
});

describe("formatPeriod", () => {
  it("formats quarters and whole years", () => {
    expect(formatPeriod(26, 3)).toBe("Q3 FY26");
    expect(formatPeriod(26, null)).toBe("FY26");
    expect(formatPeriod(5, 1)).toBe("Q1 FY05");
  });

  it("round-trips through parsePeriod", () => {
    expect(parsePeriod(formatPeriod(27, 4))).toEqual({ fy: 27, quarter: 4 });
  });
});

describe("comparePeriods", () => {
  it("sorts oldest to newest across the FY boundary", () => {
    // Q4 FY25 (Jan–Mar 2025) comes before Q1 FY26 (Apr–Jun 2025).
    const periods = [
      { fy: 26, quarter: 1 },
      { fy: 25, quarter: 4 },
      { fy: 26, quarter: null },

      { fy: 25, quarter: 1 },
      { fy: 26, quarter: 4 },
    ];

    expect([...periods].sort(comparePeriods)).toEqual([
      { fy: 25, quarter: 1 },
      { fy: 25, quarter: 4 },
      { fy: 26, quarter: 1 },

      { fy: 26, quarter: 4 },
      { fy: 26, quarter: null },
    ]);
  });

  it("returns 0 for equal periods", () => {
    expect(comparePeriods({ fy: 26, quarter: 2 }, { fy: 26, quarter: 2 })).toBe(0);
  });
});

describe("parseFilingFileName", () => {
  it("parses SYMBOL_PERIOD_TYPE.pdf", () => {
    expect(parseFilingFileName("AMBUJACEM_Q3FY26_transcript.pdf")).toEqual({
      symbol: "AMBUJACEM",
      fy: 26,
      quarter: 3,
      type: "transcript",
    });
  });

  it("accepts type aliases, any case and a missing extension", () => {
    expect(parseFilingFileName("starcement_Q4FY25_PPT.PDF")).toMatchObject({
      symbol: "STARCEMENT",
      type: "presentation",
    });

    expect(parseFilingFileName("ITC_Q1FY27_result")).toMatchObject({ type: "results" });
    expect(parseFilingFileName("M&M_Q2FY26_other.pdf")).toMatchObject({ symbol: "M&M" });
  });

  it("rejects names that don't fit the pattern", () => {
    const bad = [
      "transcript.pdf",
      "AMBUJACEM_Q3FY26.pdf",
      "AMBUJACEM_FY26_transcript.pdf",
      "AMBUJACEM_Q5FY26_transcript.pdf",
      "AMBUJACEM_Q3FY26_notes.pdf",
      "AMBUJACEM_Q3FY26_transcript_v2.pdf",
      "_Q3FY26_transcript.pdf",
    ];

    for (const name of bad) expect(parseFilingFileName(name), name).toBeNull();
  });
});

describe("filingTitle", () => {
  it("builds the default title per type", () => {
    expect(filingTitle("Ambuja Cements Ltd", 26, 3, "transcript")).toBe(
      "Ambuja Cements Ltd Q3 FY26 earnings call transcript",
    );

    expect(filingTitle("ITC Ltd", 25, 4, "presentation")).toBe(
      "ITC Ltd Q4 FY25 investor presentation",
    );
    expect(filingTitle("ITC Ltd", 25, 4, "results")).toBe("ITC Ltd Q4 FY25 results");
  });
});

describe("dateToPeriod", () => {
  it("maps months to Indian fiscal quarters", () => {
    expect(dateToPeriod("2026-04-01")).toEqual({ fy: 27, quarter: 1 });
    expect(dateToPeriod("2026-06-30")).toEqual({ fy: 27, quarter: 1 });
    expect(dateToPeriod("2026-09-30")).toEqual({ fy: 27, quarter: 2 });

    expect(dateToPeriod("2026-12-31")).toEqual({ fy: 27, quarter: 3 });
    expect(dateToPeriod("2027-01-15")).toEqual({ fy: 27, quarter: 4 });
    expect(dateToPeriod("2027-03-31")).toEqual({ fy: 27, quarter: 4 });
  });

  it("rejects bad dates", () => {
    expect(() => dateToPeriod("2026-13-01")).toThrow();
    expect(() => dateToPeriod("soon")).toThrow();
  });
});
