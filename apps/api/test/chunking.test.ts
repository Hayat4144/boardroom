import { describe, expect, it } from "vitest";
import { chunkText, normalizeText } from "../src/services/chunking";

describe("chunkText", () => {
  it("returns nothing for blank text and one chunk for short text", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
    expect(chunkText("Revenue grew 5%.")).toEqual(["Revenue grew 5%."]);
  });

  it("splits long text into bounded, overlapping chunks covering everything", () => {
    const sentences = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about margins.`);
    const text = sentences.join(" ");
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    for (const s of sentences) expect(chunks.some((c) => c.includes(s))).toBe(true);
    // consecutive chunks overlap
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1]!.slice(-20);
      expect(chunks[i]!.includes(tail.trim().split(" ").at(-1)!)).toBe(true);
    }
  });

  it("prefers paragraph boundaries", () => {
    const para = "a".repeat(200);
    const chunks = chunkText(`${para}\n\n${para}`, { maxChars: 300, overlapChars: 0 });
    expect(chunks).toEqual([para, para]);
  });

  it("rejects overlap >= max", () => {
    expect(() => chunkText("x".repeat(50), { maxChars: 10, overlapChars: 10 })).toThrow();
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and blank lines", () => {
    expect(normalizeText("a  \t b\r\n\n\n\nc ")).toBe("a b\n\nc");
  });
});
