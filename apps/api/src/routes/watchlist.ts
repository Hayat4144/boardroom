import { companies, watchlistItems } from "@boardroom/db";
import { and, desc, eq, getTableColumns } from "@boardroom/db/orm";
import { Router } from "express";
import { z } from "zod";
import { currentUser } from "../auth/middleware";
import { parse } from "../lib/http";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

const addBody = z.object({ companyId: z.uuid() });
const companyIdParam = z.object({ companyId: z.uuid() });

export function watchlistRouter({ db }: AppDeps) {
  const router = Router();

  router.get("/watchlist", async (req, res) => {
    const user = currentUser(req);
    const rows = await db
      .select({ ...getTableColumns(companies), addedAt: watchlistItems.createdAt })
      .from(watchlistItems)
      .innerJoin(companies, eq(companies.id, watchlistItems.companyId))
      .where(eq(watchlistItems.userId, user.id))
      .orderBy(desc(watchlistItems.createdAt));
    res.json({ companies: rows });
  });

  router.post("/watchlist", async (req, res) => {
    const user = currentUser(req);
    const { companyId } = parse(addBody, req.body);
    await getCompanyOr404(db, companyId);
    await db
      .insert(watchlistItems)
      .values({ userId: user.id, companyId })
      .onConflictDoNothing({ target: [watchlistItems.userId, watchlistItems.companyId] });
    res.status(201).json({ companyId });
  });

  router.delete("/watchlist/:companyId", async (req, res) => {
    const user = currentUser(req);
    const { companyId } = parse(companyIdParam, req.params);
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.userId, user.id), eq(watchlistItems.companyId, companyId)));
    res.status(204).end();
  });

  return router;
}
