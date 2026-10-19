import type {
  CompanyDetail,
  CompanyListItem,
  Filing,
  LlmCall,
  LlmCallTotals,
  Me,
  ProcessResult,
  PromiseCheck,
  PromiseItem,
  Question,
  WatchlistItem,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Error from the API: { error: code, message } with the HTTP status. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A HAYAT stub threw "TODO(HAYAT): implement" (API answers 501). */
export const isNotImplemented = (err: unknown) => err instanceof ApiError && err.status === 501;
export const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the API server. Is it running?");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string; message?: string }) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? "http_error",
      body?.message ?? `Request failed (${res.status})`,
    );
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  me: () => request<{ user: Me }>("/api/me").then((r) => r.user),

  companies: (q?: string) =>
    request<{ companies: CompanyListItem[] }>(
      `/api/companies${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ).then((r) => r.companies),
  company: (id: string) =>
    request<{ company: CompanyDetail }>(`/api/companies/${id}`).then((r) => r.company),

  watchlist: () =>
    request<{ companies: WatchlistItem[] }>("/api/watchlist").then((r) => r.companies),
  addToWatchlist: (companyId: string) =>
    request<void>("/api/watchlist", { method: "POST", body: json({ companyId }) }),
  removeFromWatchlist: (companyId: string) =>
    request<void>(`/api/watchlist/${companyId}`, { method: "DELETE" }),

  filings: (companyId: string) =>
    request<{ filings: Filing[] }>(`/api/companies/${companyId}/filings`).then((r) => r.filings),
  filingUrl: (filingId: string) =>
    request<{ url: string; expiresInSeconds: number }>(`/api/filings/${filingId}/url`),
  uploadFiling: (companyId: string, form: FormData) =>
    request<{ filing: Filing }>(`/api/companies/${companyId}/filings/upload`, {
      method: "POST",
      body: form,
    }).then((r) => r.filing),
  processFiling: (filingId: string) =>
    request<ProcessResult>(`/api/filings/${filingId}/process`, { method: "POST" }),

  promises: (companyId: string) =>
    request<{ promises: PromiseItem[] }>(`/api/companies/${companyId}/promises`).then(
      (r) => r.promises,
    ),
  checkPromises: (companyId: string) =>
    request<{ checks: PromiseCheck[] }>(`/api/companies/${companyId}/promises/check`, {
      method: "POST",
    }),

  ask: (companyId: string, question: string) =>
    request<{ question: Question }>(`/api/companies/${companyId}/ask`, {
      method: "POST",
      body: json({ question }),
    }).then((r) => r.question),
  questions: (companyId?: string) =>
    request<{ questions: Question[] }>(
      `/api/questions${companyId ? `?companyId=${companyId}` : ""}`,
    ).then((r) => r.questions),

  llmCalls: () => request<{ calls: LlmCall[]; totals: LlmCallTotals }>("/api/llm-calls"),
};

/** Opens a filing's PDF (optionally at a page) via a short-lived presigned URL. */
export async function openFilingPdf(filingId: string, page?: number | null) {
  // Open the tab synchronously so popup blockers allow it, then point it at the URL.
  const tab = window.open("about:blank", "_blank");
  try {
    const { url } = await api.filingUrl(filingId);
    const target = page ? `${url}#page=${page}` : url;
    if (tab) tab.location.href = target;
    else window.location.href = target;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
