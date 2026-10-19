/**
 * Answer a question about one company using its filings, with page-level citations.
 *
 * The caller (POST /api/companies/:id/ask) stores the result in `questions`.
 */
export async function answerQuestion(
  companyId: string,
  question: string,
): Promise<{
  answer: string;
  citations: { filingId: string; page: number; quote: string }[];
}> {
  void companyId;
  void question;
  throw new Error("TODO(HAYAT): implement");
}
