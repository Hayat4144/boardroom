import { companies, filings, promises, watchlistItems } from "@boardroom/db";
import { and, asc, count, eq, getTableColumns, ilike, or, sql } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { currentUser } from "../auth/middleware";
import { db } from "../db";
import { idParam, parse } from "../http";
import { findCompany } from "../services/companies";

export const companiesRouter = Router();

companiesRouter.get("/companies", listCompanies);
companiesRouter.get("/companies/:id", getCompany);

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Escapes LIKE wildcards so a search for "%" matches a literal "%". */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** GET /companies?q= — search by name, NSE symbol or BSE code. */
async function listCompanies(req: Request, res: Response) {
  const user = currentUser(req);
  const { q, limit } = parse(listQuery, req.query);
  const pattern = `%${escapeLike(q ?? "")}%`;

  const search = q
    ? or(
        ilike(companies.name, pattern),
        ilike(companies.nseSymbol, pattern),
        ilike(companies.bseCode, pattern),
      )
    : undefined;

  const inMyWatchlist = and(
    eq(watchlistItems.companyId, companies.id),
    eq(watchlistItems.userId, user.id),
  );

  const rows = await db
    .select({
      ...getTableColumns(companies),
      inWatchlist: sql<boolean>`${watchlistItems.id} is not null`,
    })
    .from(companies)
    .leftJoin(watchlistItems, inMyWatchlist)
    .where(search)
    .orderBy(asc(companies.name))
    .limit(limit);

  res.json({ companies: rows });
}

/** GET /companies/:id — company detail with counts and watchlist flag. */
async function getCompany(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const company = await findCompany(id);

  const [filingCounts, promiseCount, inWatchlist] = await Promise.all([
    countFilings(id),
    countPromises(id),
    isInWatchlist(user.id, id),
  ]);

  res.json({
    company: { ...company, inWatchlist, counts: { ...filingCounts, promises: promiseCount } },
  });
}

async function countFilings(companyId: string) {
  const [row] = await db
    .select({
      filings: count(),
      processedFilings: count(sql`case when ${filings.status} = 'processed' then 1 end`),
    })
    .from(filings)
    .where(eq(filings.companyId, companyId));

  return { filings: row?.filings ?? 0, processedFilings: row?.processedFilings ?? 0 };
}

async function countPromises(companyId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(promises)
    .where(eq(promises.companyId, companyId));

  return row?.total ?? 0;
}

async function isInWatchlist(userId: string, companyId: string) {
  const [row] = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.companyId, companyId)));

  return Boolean(row);
}
