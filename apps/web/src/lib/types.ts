// Shapes returned by the Boardroom API (dates arrive as ISO strings).

export type Role = "user" | "admin";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Company {
  id: string;
  name: string;
  bseCode: string | null;
  nseSymbol: string | null;
  sector: string | null;
  createdAt: string;
}

export interface CompanyListItem extends Company {
  inWatchlist: boolean;
}

export interface WatchlistItem extends Company {
  addedAt: string;
}

export interface CompanyDetail extends Company {
  inWatchlist: boolean;
  counts: { filings: number; processedFilings: number; promises: number };
}

export type FilingStatus = "new" | "processed" | "failed";

export interface Filing {
  id: string;
  companyId: string;
  source: "bse" | "nse" | "manual";
  category: string | null;
  title: string;
  filedAt: string | null;
  url: string | null;
  status: FilingStatus;
  createdAt: string;
  hasFile: boolean;
}

export type PromiseCheckStatus = "kept" | "missed" | "delayed" | "pending" | "unclear";

export interface PromiseCheck {
  id: string;
  promiseId: string;
  checkedAgainstFilingId: string | null;
  status: PromiseCheckStatus;
  evidence: string | null;
  evidencePage: number | null;
  checkedAt: string;
}

export interface PromiseItem {
  id: string;
  companyId: string;
  sourceFilingId: string;
  sourceFilingTitle: string | null;
  sourcePage: number | null;
  speaker: string | null;
  statement: string;
  metric: string | null;
  targetValue: string | null;
  deadline: string | null;
  createdAt: string;
  latestCheck: PromiseCheck | null;
}

export interface Citation {
  filingId: string;
  page: number;
  quote: string;
}

export interface Question {
  id: string;
  userId: string;
  companyId: string;
  question: string;
  answer: string;
  citations: Citation[];
  createdAt: string;
}

export interface LlmCall {
  id: string;
  userId: string | null;
  purpose: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  failed: boolean;
  createdAt: string;
}

export interface LlmCallTotals {
  calls: number;
  costUsd: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProcessResult {
  filingId: string;
  pages: number;
  chunks: number;
  extractionJobId: string | null;
}
