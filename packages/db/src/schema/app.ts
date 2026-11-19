import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { FILING_TYPES } from "../fiscal";
import { user } from "./auth";

// Output size of the local embedding model (all-MiniLM-L6-v2, apps/api/src/services/embeddings.ts).
export const EMBEDDING_DIMENSIONS = 384;

export const filingSource = pgEnum("filing_source", ["bse", "nse", "manual"]);
export const filingStatus = pgEnum("filing_status", ["new", "processed", "failed"]);
export const filingType = pgEnum("filing_type", FILING_TYPES);
export const promiseCheckStatus = pgEnum("promise_check_status", [
  "kept",
  "missed",
  "delayed",
  "pending",
  "unclear",
]);

export const companies = pgTable("companies", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  bseCode: text().unique(),
  nseSymbol: text().unique(),
  sector: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.companyId)],
);

export const filings = pgTable(
  "filings",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: filingSource().notNull(),
    type: filingType().notNull(),
    title: text().notNull(),

    // Indian fiscal year as two digits: 26 = FY26 = Apr 2025 – Mar 2026.
    fiscalYear: integer().notNull(),
    fiscalQuarter: integer().notNull(),
    filedOn: date({ mode: "string" }).notNull(),

    // Superseded by filedOn; kept (and written from filedOn) because extraction still reads it.
    filedAt: timestamp({ withTimezone: true }),
    // Original source URL (BSE/NSE); unique so automated ingestion can de-duplicate.
    url: text().unique(),
    // S3 object key: filings/{companyId}/{filingId}.pdf
    storageKey: text(),
    status: filingStatus().notNull().default("new"),
    uploadedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One filing per company, quarter and type.
    uniqueIndex("filings_company_period_type_unique").on(
      t.companyId,
      t.fiscalYear,
      t.fiscalQuarter,
      t.type,
    ),
    check("filings_fiscal_quarter_check", sql`${t.fiscalQuarter} between 1 and 4`),
  ],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid().primaryKey().defaultRandom(),
    filingId: uuid()
      .notNull()
      .references(() => filings.id, { onDelete: "cascade" }),
    pageNumber: integer().notNull(),
    text: text().notNull(),
  },
  (t) => [unique().on(t.filingId, t.pageNumber)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid().primaryKey().defaultRandom(),
    filingId: uuid()
      .notNull()
      .references(() => filings.id, { onDelete: "cascade" }),
    pageNumber: integer().notNull(),
    content: text().notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [index().on(t.filingId, t.pageNumber)],
);

export const promises = pgTable(
  "promises",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceFilingId: uuid()
      .notNull()
      .references(() => filings.id, { onDelete: "cascade" }),
    sourcePage: integer(),
    speaker: text(),
    statement: text().notNull(),
    metric: text(),
    targetValue: text(),
    deadline: date({ mode: "string" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.companyId), index().on(t.sourceFilingId)],
);

export const promiseChecks = pgTable(
  "promise_checks",
  {
    id: uuid().primaryKey().defaultRandom(),
    promiseId: uuid()
      .notNull()
      .references(() => promises.id, { onDelete: "cascade" }),
    checkedAgainstFilingId: uuid().references(() => filings.id, { onDelete: "set null" }),
    status: promiseCheckStatus().notNull(),
    evidence: text(),
    evidencePage: integer(),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.promiseId, t.checkedAt)],
);

export type Citation = { filingId: string; page: number; quote: string };

export const questions = pgTable(
  "questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    question: text().notNull(),
    answer: text().notNull(),
    citations: jsonb().$type<Citation[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.userId, t.companyId)],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    purpose: text().notNull(),
    model: text().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    costUsd: numeric({ precision: 12, scale: 6 }),
    latencyMs: integer(),
    request: jsonb(),
    response: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.createdAt)],
);

export type Company = typeof companies.$inferSelect;
export type Filing = typeof filings.$inferSelect;
export type NewFiling = typeof filings.$inferInsert;
export type FilingStatus = (typeof filingStatus.enumValues)[number];
export type DocumentPage = typeof documentPages.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type PromiseRecord = typeof promises.$inferSelect;
export type NewPromise = typeof promises.$inferInsert;
export type PromiseCheck = typeof promiseChecks.$inferSelect;
export type NewPromiseCheck = typeof promiseChecks.$inferInsert;
export type PromiseCheckStatus = (typeof promiseCheckStatus.enumValues)[number];
export type Question = typeof questions.$inferSelect;
export type LlmCall = typeof llmCalls.$inferSelect;
export type NewLlmCall = typeof llmCalls.$inferInsert;
