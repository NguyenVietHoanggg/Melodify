import type { ErrorRequestHandler, Request } from 'express';
import { z } from 'zod';
import { logger } from './logger';

/**
 * Every expected failure is an HttpError with a stable machine-readable `code`.
 * The frontend translates codes into messages (i18n) — the backend never sends UI text.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (code = 'unauthorized') => new HttpError(401, code);
export const paymentRequired = (code = 'premium_required') => new HttpError(402, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string, details?: unknown) => new HttpError(409, code, undefined, details);
export const tooMany = (code: string, details?: unknown) => new HttpError(429, code, undefined, details);

/** Validate untrusted input (body/query/params) against a zod schema or throw 400. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest('validation_error', z.prettifyError(result.error), result.error.issues);
  return result.data;
}

/** The authenticated user id, or 401. */
export function requireUser(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry a status
  if (typeof err?.status === 'number' && err.status < 500) {
    res.status(err.status).json({ error: { code: err.type ?? 'bad_request', message: err.message } });
    return;
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
};

/** Common query params: ?limit=&offset= */
export const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
