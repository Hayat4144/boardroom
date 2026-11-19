import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Code2, FileSearch, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-header";
import { usePdfViewer } from "@/components/pdf-viewer";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { PromiseStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { qk, useMe, usePromises } from "@/hooks/queries";
import { api, isNotImplemented } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PromiseItem } from "@/lib/types";

function PageLink({
  filingId,
  page,
  children,
}: {
  filingId: string;
  page: number | null;
  children: React.ReactNode;
}) {
  const openPdf = usePdfViewer();

  return (
    <button
      type="button"
      className="text-link inline-flex items-center gap-1 text-xs font-medium hover:underline"
      onClick={() => openPdf({ filingId, page })}
    >
      {children}
    </button>
  );
}

function PromiseRow({ p }: { p: PromiseItem }) {
  const meta = [p.speaker, p.metric, p.targetValue && `Target: ${p.targetValue}`].filter(Boolean);
  const check = p.latestCheck;
  return (
    <li className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_120px_110px]">
      <div className="min-w-0 space-y-1.5">
        <p className="leading-relaxed">&ldquo;{p.statement}&rdquo;</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
          <PageLink filingId={p.sourceFilingId} page={p.sourcePage}>
            {p.sourceFilingTitle ?? "Source"}
            {p.sourcePage ? `, p. ${p.sourcePage}` : ""}
          </PageLink>
        </div>
        {check?.evidence && (
          <div className="bg-muted/60 mt-2 rounded-md border-l-2 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Evidence: </span>
            {check.evidence}
            {check.checkedAgainstFilingId && (
              <>
                {" "}
                <PageLink filingId={check.checkedAgainstFilingId} page={check.evidencePage}>
                  {check.evidencePage ? `p. ${check.evidencePage}` : "source"}
                </PageLink>
              </>
            )}
          </div>
        )}
      </div>
      <div className="text-xs md:text-sm">
        <div className="text-muted-foreground text-xs md:hidden">Deadline</div>
        <span className="tabular">{p.deadline ? formatDate(p.deadline) : "No deadline"}</span>
      </div>
      <div>
        <PromiseStatusBadge status={check?.status ?? null} />
      </div>
    </li>
  );
}

export function PromisesTab({
  companyId,
  processedFilings,
}: {
  companyId: string;
  processedFilings: number;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const { data, isPending, error, refetch } = usePromises(companyId);

  const runChecks = useMutation({
    mutationFn: () => api.checkPromises(companyId),
    onSuccess: (r) => toast.success(`Checked promises: ${r.checks.length} results`),
    onError: (err) =>
      isNotImplemented(err)
        ? toast.info("Promise checking isn't built yet", {
            description: "checkPromises() still throws TODO(HAYAT): implement.",
          })
        : toast.error(err.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.promises(companyId) }),
  });

  return (
    <Panel
      title="Management promises"
      description="Guidance extracted from transcripts, checked against later results."
      actions={
        isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => runChecks.mutate()}
            disabled={runChecks.isPending || !data?.length}
          >
            {runChecks.isPending ? <Loader2 className="animate-spin" /> : <ListChecks />}
            Run checks
          </Button>
        )
      }
    >
      {isPending ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        processedFilings === 0 ? (
          <EmptyState
            icon={<FileSearch />}
            title="No processed filings yet"
            description="Promises are extracted automatically after a transcript is processed (Filings tab)."
          />
        ) : (
          <EmptyState
            icon={<Code2 />}
            title="No promises extracted yet"
            description={
              <>
                Extraction runs in the background after processing. While{" "}
                <code className="font-mono text-xs">extractPromises()</code> still throws{" "}
                <code className="font-mono text-xs">TODO(HAYAT): implement</code>, nothing will
                appear here.
              </>
            }
          />
        )
      ) : (
        <>
          <div className="text-muted-foreground hidden border-b px-4 py-2 text-xs font-medium md:grid md:grid-cols-[minmax(0,1fr)_120px_110px] md:gap-3">
            <span>Promise</span>
            <span>Deadline</span>
            <span>Status</span>
          </div>
          <ul className="divide-y">
            {data.map((p) => (
              <PromiseRow key={p.id} p={p} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
