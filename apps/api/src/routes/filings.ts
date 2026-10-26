import { FILING_TYPES, filingTitle, filings } from "@boardroom/db";
import { asc, desc, eq, sql } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { currentUser, requireAdmin } from "../auth/middleware";
import { db } from "../db";
import { httpError, idParam, parse } from "../http";
import { findCompany } from "../services/companies";
import { getStorageKey, MAX_PDF_BYTES, processFiling, uploadFiling } from "../services/filings";
import { getFileUrl, URL_EXPIRES_SECONDS } from "../services/storage";

// The upload is held in memory and sent to S3; it is never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

export const filingsRouter = Router();

filingsRouter.get("/companies/:id/filings", listFilings);
filingsRouter.get("/filings/:id/url", getFilingUrl);

filingsRouter.post(
  "/companies/:id/filings/upload",
  requireAdmin,
  upload.single("file"),
  uploadFilingRoute,
);

filingsRouter.post("/filings/:id/process", requireAdmin, processFilingRoute);

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const uploadFields = z.object({
  type: z.enum(FILING_TYPES),
  fiscalYear: z.coerce.number().int().min(1).max(99),
  fiscalQuarter: z.coerce.number().int().min(1).max(4),

  filedOn: z.iso.date(),
  title: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  url: z.preprocess(emptyToUndefined, z.url().optional()),
});

/** GET /companies/:id/filings — newest period first; the S3 key itself is never sent. */
async function listFilings(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  await findCompany(id);

  const rows = await db
    .select({
      id: filings.id,
      companyId: filings.companyId,
      source: filings.source,

      type: filings.type,
      fiscalYear: filings.fiscalYear,
      fiscalQuarter: filings.fiscalQuarter,

      title: filings.title,
      filedOn: filings.filedOn,
      url: filings.url,

      status: filings.status,
      createdAt: filings.createdAt,
      hasFile: sql<boolean>`${filings.storageKey} is not null`,
    })
    .from(filings)
    .where(eq(filings.companyId, id))
    .orderBy(
      desc(filings.fiscalYear),
      desc(filings.fiscalQuarter),
      asc(filings.type),
      asc(filings.title),
    );

  res.json({ filings: rows });
}

/** GET /filings/:id/url — presigned URL to view the PDF. */
async function getFilingUrl(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  const url = await getFileUrl(await getStorageKey(id));

  res.json({ url, expiresInSeconds: URL_EXPIRES_SECONDS });
}

/** POST /companies/:id/filings/upload (admin) — multipart form with a "file" PDF. */
async function uploadFilingRoute(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  const company = await findCompany(id);
  if (!req.file) throw httpError(400, "invalid_request", 'Missing PDF in field "file"');

  const fields = parse(uploadFields, req.body);
  const title =
    fields.title ?? filingTitle(company.name, fields.fiscalYear, fields.fiscalQuarter, fields.type);

  const filing = await uploadFiling({
    ...fields,
    companyId: id,
    data: req.file.buffer,

    uploadedBy: currentUser(req).id,
    title,
  });

  const { storageKey: _storageKey, ...rest } = filing;
  res.status(201).json({ filing: { ...rest, hasFile: true } });
}

/** POST /filings/:id/process (admin) — PDF → pages + chunks, then queue extraction. */
async function processFilingRoute(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  res.json(await processFiling(id));
}
