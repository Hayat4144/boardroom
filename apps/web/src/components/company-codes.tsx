import type { Company } from "@/lib/types";

/** NSE / BSE identifiers in monospace chips. */
export function CompanyCodes({ company }: { company: Pick<Company, "nseSymbol" | "bseCode"> }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {company.nseSymbol && <Code label="NSE" value={company.nseSymbol} />}
      {company.bseCode && <Code label="BSE" value={company.bseCode} />}
    </span>
  );
}

function Code({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 items-center gap-1 rounded-sm px-1.5 font-mono text-[11px]">
      <span className="opacity-70">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}
