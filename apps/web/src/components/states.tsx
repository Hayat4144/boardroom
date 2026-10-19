import { AlertTriangle, Code2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, isNotImplemented } from "@/lib/api";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/**
 * Shown when the API answers 501: a HAYAT stub ("TODO(HAYAT): implement")
 * hasn't been written yet. Not an error — the feature is pending.
 */
export function NotImplementedState({ feature, fn }: { feature: string; fn: string }) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-brand-subtle text-brand">
          <Code2 />
        </EmptyMedia>
        <EmptyTitle>{feature} isn&apos;t built yet</EmptyTitle>
        <EmptyDescription>
          The server reached <code className="font-mono text-xs">{fn}</code>, which still throws{" "}
          <code className="font-mono text-xs">TODO(HAYAT): implement</code>. Everything around it is
          wired up and will work as soon as it&apos;s implemented.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-danger-subtle text-danger">
          <AlertTriangle />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load this</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

/** Picks the right state for a failed query: not-implemented vs. error. */
export function QueryErrorState({
  error,
  onRetry,
  feature,
  fn,
}: {
  error: unknown;
  onRetry?: () => void;
  feature: string;
  fn: string;
}) {
  if (isNotImplemented(error)) return <NotImplementedState feature={feature} fn={fn} />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
