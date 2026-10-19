import type { PromiseCheck } from "@boardroom/db";

/**
 * Check a company's promises against later filings and record the results
 * in `promise_checks`. Returns the checks that were created.
 */
export async function checkPromises(companyId: string): Promise<PromiseCheck[]> {
  void companyId;
  throw new Error("TODO(HAYAT): implement");
}
