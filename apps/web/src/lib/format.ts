import type { FilingType } from "@boardroom/db/fiscal";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string | null | undefined) =>
  iso ? dateFmt.format(new Date(iso)) : "—";
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTimeFmt.format(new Date(iso)) : "—";
export const formatNumber = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-IN");
export const formatUsd = (v: string | number | null | undefined) => {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
};
export const formatMs = (ms: number | null | undefined) =>
  ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export const FILING_TYPE_LABEL: Record<FilingType, string> = {
  transcript: "Transcript",
  presentation: "Presentation",
  results: "Results",
  other: "Other",
};
