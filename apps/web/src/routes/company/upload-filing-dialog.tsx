import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
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
import { qk } from "@/hooks/queries";
import { api } from "@/lib/api";

const CATEGORIES = [
  "Earnings call transcript",
  "Quarterly results",
  "Investor presentation",
  "Annual report",
  "Announcement",
];

export function UploadFilingDialog({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    onError: (err) => setError(err.message),
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
        <form id="upload-filing" onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="file">PDF file</Label>
            <Input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Q2 FY26 earnings call transcript"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                list="filing-categories"
                placeholder="Optional"
              />
              <datalist id="filing-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filedAt">Filed on</Label>
              <Input id="filedAt" name="filedAt" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">Source URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://www.bseindia.com/… (optional)"
            />
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
