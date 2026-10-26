import {
  FILING_TYPES,
  filingTitle,
  parseFilingFileName,
  type FilingType,
} from "@boardroom/db/fiscal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { qk, useCompany } from "@/hooks/queries";
import { api, ApiError } from "@/lib/api";
import { FILING_TYPE_LABEL } from "@/lib/format";

const QUARTERS = [1, 2, 3, 4];
const FISCAL_YEARS = [23, 24, 25, 26, 27, 28];

/** A 409 for a company that already has this type of filing for the quarter. */
const isDuplicatePeriod = (err: unknown) =>
  err instanceof ApiError && err.status === 409 && err.code === "duplicate_period";

export function UploadFilingDialog({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const upload = useMutation({
    mutationFn: async ({ form, process }: { form: FormData; process: boolean }) => {
      const filing = await api.uploadFiling(companyId, form);
      if (!process) return { filing, processed: null };
      const processed = await api.processFiling(filing.id).catch((err: Error) => err);
      return { filing, processed };
    },
    onSuccess: ({ filing, processed }) => {
      setOpen(false);
      if (processed instanceof Error) {
        toast.error(`Uploaded "${filing.title}", but processing failed: ${processed.message}`);
      } else if (processed) {
        toast.success(`Uploaded and processed "${filing.title}"`, {
          description: `${processed.pages} pages, ${processed.chunks} chunks. Promise extraction queued.`,
        });
      } else {
        toast.success(`Uploaded "${filing.title}"`);
      }
    },
    onError: (err) => setError(err),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.filings(companyId) });
      void qc.invalidateQueries({ queryKey: qk.company(companyId) });
    },
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const process = form.get("process") === "on";
    form.delete("process");
    upload.mutate({ form, process });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload /> Upload PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a filing</DialogTitle>
          <DialogDescription>
            The PDF is stored privately in S3. Processing extracts page text for promises and
            Q&amp;A.
          </DialogDescription>
        </DialogHeader>
        {/* Lives inside DialogContent so its fields reset every time the dialog opens. */}
        <UploadFilingForm
          companyId={companyId}
          error={error}
          onChange={() => setError(null)}
          onSubmit={onSubmit}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="upload-filing" disabled={upload.isPending}>
            {upload.isPending && <Loader2 className="animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadFilingForm({
  companyId,
  error,
  onChange,
  onSubmit,
}: {
  companyId: string;
  error: Error | null;
  onChange: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const { data: company } = useCompany(companyId);
  const [type, setType] = useState<FilingType | "">("");
  const [quarter, setQuarter] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const [fileHint, setFileHint] = useState<{ warning: boolean; text: string } | null>(null);

  const duplicate = isDuplicatePeriod(error);
  // Keep a prefilled year selectable even when it is outside the usual range.
  const years =
    fiscalYear && !FISCAL_YEARS.includes(Number(fiscalYear))
      ? [...FISCAL_YEARS, Number(fiscalYear)].sort((a, b) => a - b)
      : FISCAL_YEARS;
  const titlePlaceholder =
    company && type && quarter && fiscalYear
      ? filingTitle(company.name, Number(fiscalYear), Number(quarter), type)
      : "Auto-generated from company, quarter and type";

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return setFileHint(null);

    const parsed = parseFilingFileName(file.name);
    if (!parsed) {
      return setFileHint({
        warning: false,
        text: "Tip: name files like AMBUJACEM_Q3FY26_transcript.pdf to fill in type and quarter.",
      });
    }

    setType(parsed.type);
    setQuarter(String(parsed.quarter));
    setFiscalYear(String(parsed.fy));

    const symbol = company?.nseSymbol;
    setFileHint(
      symbol && parsed.symbol !== symbol.toUpperCase()
        ? {
            warning: true,
            text: `File name says ${parsed.symbol}, but this company is ${symbol}. Check you're uploading to the right company.`,
          }
        : { warning: false, text: "Type and quarter filled in from the file name." },
    );
  };

  return (
    <form id="upload-filing" onSubmit={onSubmit} onChange={onChange} className="space-y-4">
      {error && !duplicate && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="file">PDF file</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={onFileChange}
        />
        {fileHint && (
          <p
            className={
              fileHint.warning
                ? "flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500"
                : "text-muted-foreground text-xs"
            }
          >
            {fileHint.warning && <AlertTriangle className="mt-px size-3.5 shrink-0" />}
            {fileHint.text}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <NativeSelect
            id="type"
            name="type"
            required
            value={type}
            aria-invalid={duplicate || undefined}
            onChange={(e) => setType(e.target.value as FilingType)}
          >
            <option value="" disabled>
              Select…
            </option>
            {FILING_TYPES.map((t) => (
              <option key={t} value={t}>
                {FILING_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fiscalQuarter">Quarter</Label>
          <div className="flex gap-2">
            <NativeSelect
              id="fiscalQuarter"
              name="fiscalQuarter"
              required
              value={quarter}
              aria-invalid={duplicate || undefined}
              onChange={(e) => setQuarter(e.target.value)}
            >
              <option value="" disabled>
                Q–
              </option>
              {QUARTERS.map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Fiscal year"
              name="fiscalYear"
              required
              value={fiscalYear}
              aria-invalid={duplicate || undefined}
              onChange={(e) => setFiscalYear(e.target.value)}
            >
              <option value="" disabled>
                FY–
              </option>
              {years.map((fy) => (
                <option key={fy} value={fy}>
                  FY{String(fy).padStart(2, "0")}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filedOn">Filed on</Label>
          <Input id="filedOn" name="filedOn" type="date" required />
        </div>
      </div>
      {duplicate && error && (
        <p role="alert" className="text-destructive -mt-2 text-xs">
          {error.message}. Pick another type or quarter, or reprocess the existing filing.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" placeholder={titlePlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="url">Source URL</Label>
        <Input id="url" name="url" type="url" placeholder="https://www.bseindia.com/… (optional)" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="process"
          defaultChecked
          className="accent-primary size-4 rounded-sm"
        />
        Process right after upload
      </label>
    </form>
  );
}
