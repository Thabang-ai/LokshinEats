/**
 * Request validation.
 *
 * Every handler behind this middleware can treat its input as well-formed.
 * The parsed result replaces the raw input, so unknown keys are stripped
 * rather than forwarded — that is what stops a client from smuggling an extra
 * field such as `vendorPayout` into a document write.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../lib/ApiError';

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

/** Turn a Zod failure into a flat, client-friendly field map. */
function formatIssues(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    // Keep the first message per field — the rest are usually consequences.
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // Express 5 makes req.query a getter, so assigning to it throws.
        // Defining the property works on both major versions.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new ApiError(
            'validation_failed',
            'Some fields are invalid.',
            formatIssues(error),
          ),
        );
      }
      next(error);
    }
  };
}
