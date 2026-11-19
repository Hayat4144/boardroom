import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

export type PdfTarget = {
  filingId: string;
  /** 1-based page to open at; the browser's PDF viewer jumps there via #page=N. */
  page?: number | null;

  /** Shown in the header, e.g. "Ambuja Cements Q1 FY27 transcript". */
  title?: string;
  /** The cited words, shown under the title so the reader knows what to look for. */
  quote?: string;
};

const PdfViewerContext = createContext<((target: PdfTarget) => void) | null>(null);

/** Opens a filing's PDF inside the app (a dialog), at an optional page. */
export function usePdfViewer() {
  const open = useContext(PdfViewerContext);
  if (!open) throw new Error("usePdfViewer must be used inside <PdfViewerProvider>");

  return open;
}

/** One viewer for the whole app; any component opens it with usePdfViewer(). */
export function PdfViewerProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<PdfTarget | null>(null);
  const open = useCallback((next: PdfTarget) => setTarget(next), []);

  return (
    <PdfViewerContext.Provider value={open}>
      {children}
      <Dialog open={target !== null} onOpenChange={(isOpen) => !isOpen && setTarget(null)}>
        <DialogContent className="flex h-[92vh] flex-col gap-3 p-3 sm:max-w-6xl">
          {target && <PdfViewer target={target} />}
        </DialogContent>
      </Dialog>
    </PdfViewerContext.Provider>
  );
}

/** Presigned URLs live 5 minutes; reuse one for 4 so reopening is instant but never stale. */
const URL_STALE_MS = 4 * 60 * 1000;

function PdfViewer({ target }: { target: PdfTarget }) {
  const { filingId, page, title, quote } = target;
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["filing-url", filingId],
    queryFn: () => api.filingUrl(filingId),

    staleTime: URL_STALE_MS,
    gcTime: URL_STALE_MS,
  });

  const src = useMemo(
    () => (data ? `${data.url}${page ? `#page=${page}` : ""}` : null),
    [data, page],
  );

  return (
    <>
      <div className="flex items-start gap-3 pr-10">
        <FileText className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm font-semibold">
            {title ?? "Source filing"}
            {page ? <span className="text-muted-foreground font-normal">, page {page}</span> : null}
          </DialogTitle>
          <DialogDescription className={quote ? "mt-1 line-clamp-2 text-xs" : "sr-only"}>
            {quote ? <>&ldquo;{quote}&rdquo;</> : "PDF viewer"}
          </DialogDescription>
        </div>
        {src && (
          <Button variant="ghost" size="sm" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink /> New tab
            </a>
          </Button>
        )}
      </div>

      <div className="bg-muted relative min-h-0 flex-1 overflow-hidden rounded-md border">
        {isPending && (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading PDF…
          </div>
        )}
        {error && <ErrorState error={error} onRetry={() => void refetch()} />}
        {/* key: a hash-only change doesn't re-navigate an iframe, so remount to jump pages. */}
        {src && (
          <iframe key={src} src={src} title={title ?? "Source filing"} className="size-full" />
        )}
      </div>
    </>
  );
}
