import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CompanyCodes } from "@/components/company-codes";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany, useWatchlistToggle } from "@/hooks/queries";
import { AskTab } from "./ask-tab";
import { FilingsTab } from "./filings-tab";
import { PromisesTab } from "./promises-tab";

const TABS = ["filings", "promises", "ask"] as const;
type Tab = (typeof TABS)[number];

export function CompanyPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "filings";
  const { data: company, isPending, error, refetch } = useCompany(id);
  const toggle = useWatchlistToggle();

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const watch = () =>
    toggle.mutate(
      { companyId: company.id, watch: !company.inWatchlist },
      { onError: (err) => toast.error(err.message) },
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <nav className="flex items-center gap-1">
            <Link to="/" className="hover:text-foreground">
              Watchlist
            </Link>
            <ChevronRight className="size-3" />
            <span className="text-foreground">{company.name}</span>
          </nav>
        }
        title={company.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CompanyCodes company={company} />
            {company.sector && <span>{company.sector}</span>}
          </span>
        }
        actions={
          <Button
            variant={company.inWatchlist ? "outline" : "default"}
            onClick={watch}
            disabled={toggle.isPending}
          >
            {company.inWatchlist ? <EyeOff /> : <Eye />}
            {company.inWatchlist ? "Unwatch" : "Add to watchlist"}
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Filings" value={company.counts.filings} />
        <Stat
          label="Processed"
          value={company.counts.processedFilings}
          hint={company.counts.filings ? `of ${company.counts.filings}` : undefined}
        />
        <Stat label="Promises tracked" value={company.counts.promises} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (p) => {
              p.set("tab", v);
              return p;
            },
            { replace: true },
          )
        }
      >
        <TabsList variant="line" className="w-full justify-start gap-4 border-b px-0">
          {(
            [
              ["filings", "Filings"],
              ["promises", "Promises"],
              ["ask", "Ask"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none px-1 after:bg-brand data-active:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="filings" className="pt-4">
          <FilingsTab companyId={company.id} />
        </TabsContent>
        <TabsContent value="promises" className="pt-4">
          <PromisesTab companyId={company.id} processedFilings={company.counts.processedFilings} />
        </TabsContent>
        <TabsContent value="ask" className="pt-4">
          <AskTab companyId={company.id} companyName={company.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
