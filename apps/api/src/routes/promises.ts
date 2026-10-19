import { filings, promiseChecks, promises, type PromiseCheck } from "@boardroom/db";
import { desc, eq, getTableColumns, inArray, sql } from "@boardroom/db/orm";
import { Router } from "express";
import { requireAdmin } from "../auth/middleware";
import { checkPromises } from "../extraction/checkPromises";
import { idParam, parse } from "../lib/http";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

export function promisesRouter({ db }: AppDeps) {
  const router = Router();

  router.get("/companies/:id/promises", async (req, res) => {
    const { id } = parse(idParam, req.params);
    await getCompanyOr404(db, id);
    const rows = await db
      .select({ ...getTableColumns(promises), sourceFilingTitle: filings.title })
      .from(promises)
      .leftJoin(filings, eq(filings.id, promises.sourceFilingId))
      .where(eq(promises.companyId, id))
      .orderBy(sql`${promises.deadline} asc nulls last`, desc(promises.createdAt));

    const latest = new Map<string, PromiseCheck>();
    if (rows.length > 0) {
      const checks = await db
        .select()
        .from(promiseChecks)
        .where(
          inArray(
            promiseChecks.promiseId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(desc(promiseChecks.checkedAt));
      for (const check of checks) {
        if (!latest.has(check.promiseId)) latest.set(check.promiseId, check);
      }
    }

    res.json({
      promises: rows.map((p) => ({ ...p, latestCheck: latest.get(p.id) ?? null })),
    });
  });

  router.post("/companies/:id/promises/check", requireAdmin, async (req, res) => {
    const { id } = parse(idParam, req.params);
    await getCompanyOr404(db, id);
    const checks = await checkPromises(id);
    res.json({ checks });
  });

  return router;
}
