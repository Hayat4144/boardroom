import { companies, filings, promises, watchlistItems } from "@boardroom/db";
import { and, asc, count, eq, getTableColumns, ilike, or, sql } from "@boardroom/db/orm";
import { Router } from "express";
import { z } from "zod";
import { currentUser } from "../auth/middleware";
import { idParam, parse } from "../lib/http";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export function companiesRouter({ db }: AppDeps) {
  const router = Router();

  router.get("/companies", async (req, res) => {
    const user = currentUser(req);
    const { q, limit } = parse(listQuery, req.query);
    const pattern = q ? `%${escapeLike(q)}%` : undefined;
    const rows = await db
      .select({
        ...getTableColumns(companies),
        inWatchlist: sql<boolean>`${watchlistItems.id} is not null`,
      })
      .from(companies)
      .leftJoin(
        watchlistItems,
        and(eq(watchlistItems.companyId, companies.id), eq(watchlistItems.userId, user.id)),
      )
      .where(
        pattern
          ? or(
              ilike(companies.name, pattern),
              ilike(companies.nseSymbol, pattern),
              ilike(companies.bseCode, pattern),
            )
          : undefined,
      )
      .orderBy(asc(companies.name))
      .limit(limit);
    res.json({ companies: rows });
  });

  router.get("/companies/:id", async (req, res) => {
    const user = currentUser(req);
    const { id } = parse(idParam, req.params);
    const company = await getCompanyOr404(db, id);
    const [[filingCounts], [promiseCounts], [watch]] = await Promise.all([
      db
        .select({
          total: count(),
          processed: count(sql`case when ${filings.status} = 'processed' then 1 end`),
        })
        .from(filings)
        .where(eq(filings.companyId, id)),
      db.select({ total: count() }).from(promises).where(eq(promises.companyId, id)),
      db
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(and(eq(watchlistItems.companyId, id), eq(watchlistItems.userId, user.id))),
    ]);
    res.json({
      company: {
        ...company,
        inWatchlist: Boolean(watch),
        counts: {
          filings: filingCounts?.total ?? 0,
          processedFilings: filingCounts?.processed ?? 0,
          promises: promiseCounts?.total ?? 0,
        },
      },
    });
  });

  return router;
}
