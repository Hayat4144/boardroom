import { filings } from "@boardroom/db";
import { desc, eq, sql } from "@boardroom/db/orm";
import { Router } from "express";
import { HttpError, idParam, notFound, parse } from "../lib/http";
import { DEFAULT_PRESIGN_SECONDS } from "../services/storage";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

export function filingsRouter({ db, storage }: AppDeps) {
  const router = Router();

  router.get("/companies/:id/filings", async (req, res) => {
    const { id } = parse(idParam, req.params);
    await getCompanyOr404(db, id);
    const rows = await db
      .select({
        id: filings.id,
        companyId: filings.companyId,
        source: filings.source,
        category: filings.category,
        title: filings.title,
        filedAt: filings.filedAt,
        url: filings.url,
        status: filings.status,
        createdAt: filings.createdAt,
        hasFile: sql<boolean>`${filings.storageKey} is not null`,
      })
      .from(filings)
      .where(eq(filings.companyId, id))
      .orderBy(sql`${filings.filedAt} desc nulls last`, desc(filings.createdAt));
    res.json({ filings: rows });
  });

  router.get("/filings/:id/url", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const [filing] = await db
      .select({ storageKey: filings.storageKey })
      .from(filings)
      .where(eq(filings.id, id));
    if (!filing) throw notFound("Filing");
    if (!filing.storageKey) throw new HttpError(409, "no_file", "Filing has no stored PDF");
    const url = await storage.getPresignedUrl(filing.storageKey, DEFAULT_PRESIGN_SECONDS);
    res.json({ url, expiresInSeconds: DEFAULT_PRESIGN_SECONDS });
  });

  return router;
}
