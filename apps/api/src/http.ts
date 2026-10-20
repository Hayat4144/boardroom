import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod";

/** An error that becomes a JSON response: { error: code, message }. */
export type HttpError = Error & { status: number; code: string };

export function httpError(status: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { status, code });
}

export function notFound(what: string): HttpError {
  return httpError(404, "not_found", `${what} not found`);
}

function isHttpError(err: unknown): err is HttpError {
  const e = err as Partial<HttpError>;
  return err instanceof Error && typeof e.status === "number" && typeof e.code === "string";
}

/** True for the error thrown by a not-yet-implemented HAYAT stub. */
export function isStubError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith("TODO(HAYAT)");
}

/** Validates input against a Zod schema, throwing a 400 with readable details. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw httpError(400, "invalid_request", z.prettifyError(result.error));
}

export const idParam = z.object({ id: z.uuid() });

/**
 * Turns any thrown error into a JSON response. An unimplemented HAYAT stub
 * becomes 501 "not_implemented", which the web app shows as an empty state.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isHttpError(err)) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: "invalid_upload", message: err.message });
    return;
  }

  if (isStubError(err)) {
    res.status(501).json({ error: "not_implemented", message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
};
