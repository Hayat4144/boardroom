import type { FilingStatus, PromiseCheckStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success-subtle text-success border-success/25",
  warning: "bg-warning-subtle text-warning border-warning/25",
  danger: "bg-danger-subtle text-danger border-danger/25",
  info: "bg-info-subtle text-info border-info/25",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

const filingTone: Record<FilingStatus, Tone> = {
  new: "info",
  processed: "success",
  failed: "danger",
};
const filingLabel: Record<FilingStatus, string> = {
  new: "Not processed",
  processed: "Processed",
  failed: "Failed",
};

export function FilingStatusBadge({ status }: { status: FilingStatus }) {
  return <StatusPill tone={filingTone[status]}>{filingLabel[status]}</StatusPill>;
}

const promiseTone: Record<PromiseCheckStatus, Tone> = {
  kept: "success",
  missed: "danger",
  delayed: "warning",
  pending: "info",
  unclear: "neutral",
};

export function PromiseStatusBadge({ status }: { status: PromiseCheckStatus | null }) {
  if (!status) return <StatusPill tone="neutral">Not checked</StatusPill>;
  return (
    <StatusPill tone={promiseTone[status]} className="capitalize">
      {status}
    </StatusPill>
  );
}
