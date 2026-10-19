import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isUnauthorized } from "@/lib/api";

export const qk = {
  me: ["me"] as const,
  companies: (q: string) => ["companies", q] as const,
  company: (id: string) => ["company", id] as const,
  watchlist: ["watchlist"] as const,
  filings: (companyId: string) => ["filings", companyId] as const,
  promises: (companyId: string) => ["promises", companyId] as const,
  questions: (companyId: string) => ["questions", companyId] as const,
  llmCalls: ["llm-calls"] as const,
};

/** Current user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (isUnauthorized(err)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export const useCompanies = (q: string) =>
  useQuery({ queryKey: qk.companies(q), queryFn: () => api.companies(q) });

export const useCompany = (id: string) =>
  useQuery({ queryKey: qk.company(id), queryFn: () => api.company(id) });

export const useWatchlist = () => useQuery({ queryKey: qk.watchlist, queryFn: api.watchlist });

export function useWatchlistToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, watch }: { companyId: string; watch: boolean }) =>
      watch ? api.addToWatchlist(companyId) : api.removeFromWatchlist(companyId),
    onSettled: (_data, _err, { companyId }) => {
      void qc.invalidateQueries({ queryKey: qk.watchlist });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: qk.company(companyId) });
    },
  });
}

export const useFilings = (companyId: string) =>
  useQuery({ queryKey: qk.filings(companyId), queryFn: () => api.filings(companyId) });

export const usePromises = (companyId: string) =>
  useQuery({
    queryKey: qk.promises(companyId),
    queryFn: () => api.promises(companyId),
  });

export const useQuestions = (companyId: string) =>
  useQuery({ queryKey: qk.questions(companyId), queryFn: () => api.questions(companyId) });

export const useLlmCalls = () => useQuery({ queryKey: qk.llmCalls, queryFn: api.llmCalls });
