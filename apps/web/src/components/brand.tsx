import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="32" height="32" rx="7" className="fill-brand" />
      <g className="fill-brand-foreground">
        <rect x="8" y="8.5" width="16" height="3.5" rx="1.75" />
        <rect x="8" y="14.25" width="11" height="3.5" rx="1.75" />
        <rect x="8" y="20" width="14" height="3.5" rx="1.75" />
      </g>
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight">Boardroom</span>
    </div>
  );
}
