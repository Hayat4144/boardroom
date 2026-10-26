import type { companies } from "../schema";

type SeedCompany = Omit<typeof companies.$inferInsert, "id" | "createdAt">;

// Cement test set, plus ITC (FMCG) as a negative-test company.
export const SEED_COMPANIES = [
  { name: "Ambuja Cements Ltd", nseSymbol: "AMBUJACEM", bseCode: "500425", sector: "Cement" },
  { name: "Star Cement Ltd", nseSymbol: "STARCEMENT", bseCode: "540575", sector: "Cement" },
  { name: "Birla Corporation Ltd", nseSymbol: "BIRLACORPN", bseCode: "500335", sector: "Cement" },

  { name: "JK Lakshmi Cement Ltd", nseSymbol: "JKLAKSHMI", bseCode: "500380", sector: "Cement" },
  { name: "Sagar Cements Ltd", nseSymbol: "SAGCEM", bseCode: "502090", sector: "Cement" },
  { name: "ITC Ltd", nseSymbol: "ITC", bseCode: "500875", sector: "FMCG" },
] as const satisfies readonly SeedCompany[];
