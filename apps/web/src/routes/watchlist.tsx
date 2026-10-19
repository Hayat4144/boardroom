import { Check, LayoutList, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CompanyCodes } from "@/components/company-codes";
import { PageHeader, Panel } from "@/components/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompanies, useWatchlist, useWatchlistToggle } from "@/hooks/queries";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate } from "@/lib/format";

function CompanySearch() {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const { data, isPending, error, refetch } = useCompanies(q);
  const toggle = useWatchlistToggle();

  const add = (companyId: string, name: string) =>
    toggle.mutate(
      { companyId, watch: true },
      {
        onSuccess: () => toast.success(`Added ${name} to your watchlist`),
        onError: (err) => toast.error(err.message),
      },
    );

  return (
    <Panel
      title="Add companies"
      description="Search by name, NSE symbol or BSE code."
      className="lg:sticky lg:top-8"
    >
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Infosys, INFY, 500209"
            className="pl-8"
            aria-label="Search companies"
          />
        </div>
      </div>
      {isPending ? (
        <TableSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center">
          No companies match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <ul className="max-h-[420px] divide-y overflow-y-auto">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1 space-y-1">
                <Link
                  to={`/companies/${c.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {c.name}
                </Link>
                <CompanyCodes company={c} />
              </div>
              {c.inWatchlist ? (
                <span className="text-success inline-flex items-center gap-1 text-xs font-medium">
                  <Check className="size-3.5" /> Watching
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => add(c.id, c.name)}
                  disabled={toggle.isPending && toggle.variables?.companyId === c.id}
                >
                  <Plus /> Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WatchlistTable() {
  const { data, isPending, error, refetch } = useWatchlist();
  const toggle = useWatchlistToggle();

  const remove = (companyId: string, name: string) =>
    toggle.mutate(
      { companyId, watch: false },
      {
        onSuccess: () => toast(`Removed ${name}`),
        onError: (err) => toast.error(err.message),
      },
    );

  return (
    <Panel title="Your companies" description={data ? `${data.length} watched` : undefined}>
      {isPending ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<LayoutList />}
          title="Your watchlist is empty"
          description="Search for a company on the right and add it to start tracking its filings and promises."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Company</TableHead>
              <TableHead className="hidden sm:table-cell">Sector</TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-2.5 pl-4">
                  <Link
                    to={`/companies/${c.id}`}
                    className="text-link block font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="mt-1">
                    <CompanyCodes company={c} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {c.sector ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground tabular hidden md:table-cell">
                  {formatDate(c.addedAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${c.name} from watchlist`}
                    onClick={() => remove(c.id, c.name)}
                  >
                    <X />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

export function WatchlistPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description="Companies you follow. Open one to see its filings, management promises and to ask questions."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <WatchlistTable />
        <CompanySearch />
      </div>
    </div>
  );
}
