import { Activity, RefreshCw } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { StatusPill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLlmCalls } from "@/hooks/queries";
import { formatDateTime, formatMs, formatNumber, formatUsd } from "@/lib/format";

export function LlmCallsPage() {
  const { data, isPending, isFetching, error, refetch } = useLlmCalls();
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="LLM calls"
        description="Every request made through LLMClient, with tokens, cost and latency."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Calls" value={totals ? formatNumber(totals.calls) : "—"} />
        <Stat label="Total cost" value={totals ? formatUsd(totals.costUsd) : "—"} />
        <Stat label="Input tokens" value={totals ? formatNumber(totals.inputTokens) : "—"} />
        <Stat label="Output tokens" value={totals ? formatNumber(totals.outputTokens) : "—"} />
      </div>

      <Panel title="Recent calls" description="Latest 100">
        {isPending ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.calls.length === 0 ? (
          <EmptyState
            icon={<Activity />}
            title="No LLM calls yet"
            description="Calls appear here once extraction, checking or Q&A start using the LLM client."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Time</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="hidden md:table-cell">Model</TableHead>
                <TableHead className="text-right">Tokens in / out</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="pr-4">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.calls.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground tabular pl-4">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">{c.purpose}</TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                    {c.model}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(c.inputTokens)} / {formatNumber(c.outputTokens)}
                  </TableCell>
                  <TableCell className="tabular text-right">{formatUsd(c.costUsd)}</TableCell>
                  <TableCell className="tabular text-right">{formatMs(c.latencyMs)}</TableCell>
                  <TableCell className="pr-4">
                    {c.failed ? (
                      <StatusPill tone="danger">Error</StatusPill>
                    ) : (
                      <StatusPill tone="success">OK</StatusPill>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
