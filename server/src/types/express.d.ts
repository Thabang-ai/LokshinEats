/**
 * Request augmentation.
 *
 * `req.auth` is populated by the authenticate middleware and is the only
 * trustworthy source of caller identity — never read the uid or role from the
 * request body, where a client controls it.
 */

import type { AuthContext } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      // `id` (the correlation id) is intentionally not declared here:
      // pino-http already augments Request with it, and a second declaration
      // merges into a conflicting type.

    }
  }
}

export {};
