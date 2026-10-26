import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatPeriod } from "@boardroom/db/fiscal";
import { ExternalLink, FileText, Loader2, RotateCw, Play } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { FilingStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { qk, useFilings, useMe } from "@/hooks/queries";
import { api, openFilingPdf } from "@/lib/api";
import { FILING_TYPE_LABEL, formatDate } from "@/lib/format";
import type { Filing } from "@/lib/types";
import { UploadFilingDialog } from "./upload-filing-dialog";

const SOURCE_LABEL: Record<Filing["source"], string> = { bse: "BSE", nse: "NSE", manual: "Upload" };

function ProcessButton({ filing }: { filing: Filing }) {
  const qc = useQueryClient();
  const process = useMutation({
    mutationFn: () => api.processFiling(filing.id),
    onSuccess: (r) =>
      toast.success(`Processed "${filing.title}"`, {
        description: `${r.pages} pages, ${r.chunks} chunks. Promise extraction queued.`,
      }),
    onError: (err) => toast.error(`Processing failed: ${err.message}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.filings(filing.companyId) });
      void qc.invalidateQueries({ queryKey: qk.company(filing.companyId) });
    },
  });
  const again = filing.status !== "new";
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => process.mutate()}
      disabled={process.isPending || !filing.hasFile}
    >
      {process.isPending ? <Loader2 className="animate-spin" /> : again ? <RotateCw /> : <Play />}
      {again ? "Reprocess" : "Process"}
    </Button>
  );
}

function ViewPdfButton({ filing }: { filing: Filing }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!filing.hasFile}
      onClick={() => void openFilingPdf(filing.id).catch((err: Error) => toast.error(err.message))}
    >
      <ExternalLink /> View PDF
    </Button>
  );
}

export function FilingsTab({ companyId }: { companyId: string }) {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const { data, isPending, error, refetch } = useFilings(companyId);

  return (
    <Panel
      title="Filings"
      description="Transcripts, results and announcements for this company."
      actions={isAdmin ? <UploadFilingDialog companyId={companyId} /> : undefined}
    >
      {isPending ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No filings yet"
          description={
            isAdmin
              ? "Upload an earnings-call transcript or results PDF to get started."
              : "An admin hasn't added filings for this company yet."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Filing</TableHead>
              <TableHead className="hidden md:table-cell">Filed</TableHead>
              <TableHead className="hidden lg:table-cell">Source</TableHead>
              <TableHead className="pr-4 sm:pr-2">Status</TableHead>
              <TableHead className="hidden pr-4 text-right sm:table-cell">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="py-2.5 pl-4 whitespace-normal sm:max-w-[320px]">
                  <div className="font-medium">{f.title}</div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className="tabular">
                      {formatPeriod(f.fiscalYear, f.fiscalQuarter)} · {FILING_TYPE_LABEL[f.type]}
                    </Badge>
                    <span className="md:hidden">{formatDate(f.filedOn)}</span>
                  </div>
                  <div className="mt-2 flex gap-1.5 sm:hidden">
                    <ViewPdfButton filing={f} />
                    {isAdmin && <ProcessButton filing={f} />}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground tabular hidden md:table-cell">
                  {formatDate(f.filedOn)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {SOURCE_LABEL[f.source]}
                </TableCell>
                <TableCell className="pr-4 align-top sm:pr-2 sm:align-middle">
                  <FilingStatusBadge status={f.status} />
                </TableCell>
                <TableCell className="hidden pr-4 sm:table-cell">
                  <div className="flex justify-end gap-1.5">
                    <ViewPdfButton filing={f} />
                    {isAdmin && <ProcessButton filing={f} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
