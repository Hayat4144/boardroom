import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { isStubError } from "../stubs";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);

/** Validates input against a Zod schema, throwing a 400 with readable details. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", z.prettifyError(result.error));
  }
  return result.data;
}

export const idParam = z.object({ id: z.uuid() });

/**
 * JSON error responses: { error: code, message }.
 * A HAYAT stub that hasn't been implemented yet becomes 501 "not_implemented",
 * which the web app shows as a dedicated empty state.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (isStubError(err)) {
    res.status(501).json({ error: "not_implemented", message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
};
