/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * pipeline. Express 4 does not await handlers, so without this an async throw
 * becomes an unhandled rejection and the request hangs until it times out.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
