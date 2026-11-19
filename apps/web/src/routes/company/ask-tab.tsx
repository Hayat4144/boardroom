import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, MessageSquareText, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "@/components/page-header";
import { usePdfViewer } from "@/components/pdf-viewer";
import { EmptyState, ErrorState, NotImplementedState, TableSkeleton } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { qk, useFilings, useQuestions } from "@/hooks/queries";
import { ApiError, api, isNotImplemented } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

function AnswerCard({ q, filingTitles }: { q: Question; filingTitles: Map<string, string> }) {
  const openPdf = usePdfViewer();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-muted-foreground text-xs">{formatDateTime(q.createdAt)}</div>
        <h3 className="mt-1 font-semibold">{q.question}</h3>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{q.answer}</p>
      {q.citations.length > 0 && (
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Sources
          </div>
          <ol className="space-y-2">
            {q.citations.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() =>
                    openPdf({
                      filingId: c.filingId,
                      page: c.page,
                      title: filingTitles.get(c.filingId),
                      quote: c.quote,
                    })
                  }
                  className="hover:border-primary/40 hover:bg-accent group w-full rounded-md border p-3 text-left transition-colors"
                >
                  <div className="text-link flex items-center gap-1.5 text-xs font-medium">
                    <span className="bg-muted text-foreground tabular rounded-sm px-1.5">
                      {i + 1}
                    </span>
                    <FileText className="size-3.5" />
                    <span className="truncate group-hover:underline">
                      {filingTitles.get(c.filingId) ?? "Filing"}, page {c.page}
                    </span>
                  </div>
                  <blockquote className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    &ldquo;{c.quote}&rdquo;
                  </blockquote>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function AskTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useQuestions(companyId);
  const filings = useFilings(companyId);
  const filingTitles = useMemo(
    () => new Map((filings.data ?? []).map((f) => [f.id, f.title])),
    [filings.data],
  );

  const ask = useMutation({
    mutationFn: (q: string) => api.ask(companyId, q),
    onSuccess: (saved) => {
      setQuestion("");
      setSelectedId(saved.id);
      qc.setQueryData<Question[]>(qk.questions(companyId), (old) => [saved, ...(old ?? [])]);
    },
  });

  const selected =
    history.data?.find((q) => q.id === selectedId) ?? (ask.isError ? undefined : history.data?.[0]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length >= 3) ask.mutate(q);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Panel title={`Ask about ${companyName}`} description="Answers cite the exact filing page.">
          <form onSubmit={onSubmit} className="space-y-3 p-4">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What margin guidance did management give for FY26, and did they meet it?"
              rows={3}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(e);
              }}
              aria-label="Your question"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs">
                Ctrl/⌘ + Enter to send · daily question limit applies
              </span>
              <Button type="submit" disabled={ask.isPending || question.trim().length < 3}>
                {ask.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Ask
              </Button>
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="p-4 md:p-5">
            {ask.isPending ? (
              <div className="text-muted-foreground flex items-center gap-2 py-8">
                <Loader2 className="size-4 animate-spin" /> Reading the filings…
              </div>
            ) : ask.isError && isNotImplemented(ask.error) ? (
              <NotImplementedState feature="Ask-the-filings" fn="answerQuestion()" />
            ) : ask.isError && ask.error instanceof ApiError && ask.error.status === 429 ? (
              <Alert>
                <AlertTitle>Daily limit reached</AlertTitle>
                <AlertDescription>{ask.error.message}</AlertDescription>
              </Alert>
            ) : ask.isError ? (
              <ErrorState error={ask.error} />
            ) : selected ? (
              <AnswerCard q={selected} filingTitles={filingTitles} />
            ) : (
              <EmptyState
                icon={<MessageSquareText />}
                title="Ask your first question"
                description="Questions are answered from this company's processed filings, with page-level citations."
              />
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Your questions"
        description="Only you can see these."
        className="lg:sticky lg:top-8"
      >
        {history.isPending ? (
          <TableSkeleton rows={3} />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-xs">No questions yet.</p>
        ) : (
          <ul className="max-h-[520px] divide-y overflow-y-auto">
            {history.data.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    ask.reset();
                    setSelectedId(q.id);
                  }}
                  className={cn(
                    "hover:bg-muted/60 w-full px-4 py-2.5 text-left",
                    selected?.id === q.id && !ask.isError && "bg-accent",
                  )}
                >
                  <div className="line-clamp-2 text-[13px] font-medium">{q.question}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {formatDateTime(q.createdAt)} · {q.citations.length} sources
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
