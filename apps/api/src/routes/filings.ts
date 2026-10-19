import { filings } from "@boardroom/db";
import { desc, eq, sql } from "@boardroom/db/orm";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { currentUser, requireAdmin } from "../auth/middleware";
import { HttpError, idParam, notFound, parse } from "../lib/http";
import { MAX_PDF_BYTES, processFiling, uploadFiling } from "../services/ingestion";
import { DEFAULT_PRESIGN_SECONDS } from "../services/storage";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const uploadFields = z.object({
  title: z.string().trim().min(1).max(500),
  category: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  filedAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  url: z.preprocess(emptyToUndefined, z.url().optional()),
});

// Memory storage: the upload is held in RAM and streamed to S3, never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

export function filingsRouter({ db, storage, jobs }: AppDeps) {
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

  router.post(
    "/companies/:id/filings/upload",
    requireAdmin,
    upload.single("file"),
    async (req, res) => {
      const { id } = parse(idParam, req.params);
      await getCompanyOr404(db, id);
      if (!req.file) throw new HttpError(400, "invalid_request", 'Missing PDF in field "file"');
      const fields = parse(uploadFields, req.body);
      const filing = await uploadFiling(
        { db, storage },
        { companyId: id, data: req.file.buffer, uploadedBy: currentUser(req).id, ...fields },
      );
      const { storageKey: _key, ...rest } = filing;
      res.status(201).json({ filing: { ...rest, hasFile: true } });
    },
  );

  router.post("/filings/:id/process", requireAdmin, async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await processFiling({ db, storage, jobs }, id));
  });

  return router;
}
