/**
 * Typed application error.
 *
 * Anything thrown that is not an ApiError is treated by the error handler as
 * an unexpected fault: logged at error level and reported to the client as a
 * generic 500, so internal details never leak into a response.
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Machine-readable extras, e.g. per-field validation messages. */
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError('bad_request', message, details);
  }
  static unauthenticated(message = 'Authentication required.') {
    return new ApiError('unauthenticated', message);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError('forbidden', message);
  }
  static notFound(message = 'Resource not found.') {
    return new ApiError('not_found', message);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError('conflict', message, details);
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError('unprocessable', message, details);
  }
  static internal(message = 'Something went wrong.') {
    return new ApiError('internal', message);
  }
}
