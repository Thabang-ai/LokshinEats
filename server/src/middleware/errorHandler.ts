/**
 * Error boundary and 404 handler.
 *
 * Two rules hold here:
 *   - Expected failures (ApiError) carry their own status, code, and message.
 *   - Anything else is a bug. It is logged in full and reported as a bare 500,
 *     so stack traces, Firestore internals, and provider messages never reach
 *     a client.
 */

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

/** Terminal 404 — mounted after every route. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}.`));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express requires the 4-arity signature; if headers are already sent the
  // only correct action is to let Express destroy the socket.
  if (res.headersSent) return next(error);

  // pino-http types req.id as string | number | object, so normalise it to
  // the string shape the error contract promises.
  const requestId = req.id === undefined ? undefined : String(req.id);

  if (error instanceof ApiError) {
    // 5xx ApiErrors are still our fault and deserve a full log line.
    if (error.status >= 500) {
      logger.error({ err: error, requestId }, 'Request failed.');
    } else {
      logger.debug(
        { code: error.code, status: error.status, requestId },
        error.message,
      );
    }

    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    res.status(error.status).json(body);
    return;
  }

  // Malformed JSON is surfaced by body-parser as a SyntaxError with a status.
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Request body is not valid JSON.',
        ...(requestId ? { requestId } : {}),
      },
    } satisfies ErrorBody);
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error.');

  const body: ErrorBody = {
    error: {
      code: 'internal',
      message: 'Something went wrong.',
      ...(requestId ? { requestId } : {}),
      // Outside production the real message speeds up debugging; it is never
      // included in a deployed environment.
      ...(isProduction
        ? {}
        : { details: error instanceof Error ? error.message : String(error) }),
    },
  };
  res.status(500).json(body);
}
