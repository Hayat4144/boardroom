import { filings, promiseChecks, promises, type PromiseCheck } from "@boardroom/db";
import { desc, eq, getTableColumns, inArray, sql } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware";
import { db } from "../db";
import { checkPromises } from "../extraction/checkPromises";
import { idParam, parse } from "../http";
import { findCompany } from "../services/companies";

export const promisesRouter = Router();

promisesRouter.get("/companies/:id/promises", listPromises);
promisesRouter.post("/companies/:id/promises/check", requireAdmin, runPromiseCheck);

/** GET /companies/:id/promises — each promise with its most recent check (or null). */
async function listPromises(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  await findCompany(id);

  const rows = await db
    .select({ ...getTableColumns(promises), sourceFilingTitle: filings.title })
    .from(promises)
    .leftJoin(filings, eq(filings.id, promises.sourceFilingId))
    .where(eq(promises.companyId, id))
    .orderBy(sql`${promises.deadline} asc nulls last`, desc(promises.createdAt));

  const latestChecks = await getLatestChecks(rows.map((row) => row.id));
  const withChecks = rows.map((row) => ({ ...row, latestCheck: latestChecks.get(row.id) ?? null }));

  res.json({ promises: withChecks });
}

/** POST /companies/:id/promises/check (admin) — runs HAYAT's checkPromises(). */
async function runPromiseCheck(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  await findCompany(id);

  const checks = await checkPromises(id);
  res.json({ checks });
}

/** Map of promiseId → its newest check. */
async function getLatestChecks(promiseIds: string[]): Promise<Map<string, PromiseCheck>> {
  const latest = new Map<string, PromiseCheck>();
  if (promiseIds.length === 0) return latest;

  const checks = await db
    .select()
    .from(promiseChecks)
    .where(inArray(promiseChecks.promiseId, promiseIds))
    .orderBy(desc(promiseChecks.checkedAt));

  // Newest first, so the first check seen for a promise is its latest.
  for (const check of checks) {
    if (!latest.has(check.promiseId)) latest.set(check.promiseId, check);
  }

  return latest;
}
