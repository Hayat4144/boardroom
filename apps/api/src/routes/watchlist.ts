import { companies, watchlistItems } from "@boardroom/db";
import { and, desc, eq, getTableColumns } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { currentUser } from "../auth/middleware";
import { db } from "../db";
import { parse } from "../http";
import { findCompany } from "../services/companies";

export const watchlistRouter = Router();

watchlistRouter.get("/watchlist", listWatchlist);
watchlistRouter.post("/watchlist", addToWatchlist);
watchlistRouter.delete("/watchlist/:companyId", removeFromWatchlist);

const companyIdSchema = z.object({ companyId: z.uuid() });

/** GET /watchlist — the current user's companies, newest first. */
async function listWatchlist(req: Request, res: Response) {
  const user = currentUser(req);

  const rows = await db
    .select({ ...getTableColumns(companies), addedAt: watchlistItems.createdAt })
    .from(watchlistItems)
    .innerJoin(companies, eq(companies.id, watchlistItems.companyId))
    .where(eq(watchlistItems.userId, user.id))
    .orderBy(desc(watchlistItems.createdAt));

  res.json({ companies: rows });
}

/** POST /watchlist { companyId } — adding twice is a no-op. */
async function addToWatchlist(req: Request, res: Response) {
  const user = currentUser(req);
  const { companyId } = parse(companyIdSchema, req.body);
  await findCompany(companyId);

  await db
    .insert(watchlistItems)
    .values({ userId: user.id, companyId })
    .onConflictDoNothing({ target: [watchlistItems.userId, watchlistItems.companyId] });

  res.status(201).json({ companyId });
}

/** DELETE /watchlist/:companyId */
async function removeFromWatchlist(req: Request, res: Response) {
  const user = currentUser(req);
  const { companyId } = parse(companyIdSchema, req.params);

  await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.userId, user.id), eq(watchlistItems.companyId, companyId)));

  res.status(204).end();
}
