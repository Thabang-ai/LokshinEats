/**
 * Rate limiting.
 *
 * Two buckets: a broad one for the whole API, and a much tighter one for
 * endpoints where a brute-force attempt is the actual threat — delivery-code
 * submission, payment initiation, and anything that mutates money.
 *
 * Keying prefers the authenticated uid over the IP. Mobile carriers put huge
 * numbers of users behind one NAT address, so IP-only keying would throttle
 * real customers in the same township as an attacker.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env, isTest } from '../config/env';
import { ApiError } from '../lib/ApiError';

/**
 * Collapse an address to the unit we actually want to limit.
 *
 * IPv4 is used whole. IPv6 is truncated to its /64 prefix, because a single
 * subscriber is routinely handed an entire /64 and could otherwise cycle
 * through addresses within it to reset their counter.
 */
function normaliseIp(ip: string): string {
  if (!ip) return 'unknown';

  // Express reports IPv4-mapped IPv6 as ::ffff:1.2.3.4.
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!mapped.includes(':')) return mapped;

  // Expand the :: compression so the first four hextets are unambiguous.
  const [head = '', tail = ''] = mapped.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const full = mapped.includes('::')
    ? [...headParts, ...Array(Math.max(0, missing)).fill('0'), ...tailParts]
    : mapped.split(':');

  return full.slice(0, 4).join(':');
}

function keyFor(req: Request): string {
  // Prefer the authenticated identity: it survives a changed IP and cannot be
  // shared by unrelated users behind the same carrier NAT.
  if (req.auth?.uid) return `uid:${req.auth.uid}`;
  return `ip:${normaliseIp(req.ip ?? '')}`;
}

const shared: Partial<Options> = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyFor,
  // Route the rejection through the normal error pipeline so the response
  // shape matches every other error the API returns.
  handler: (_req, _res, next) => {
    next(
      new ApiError('rate_limited', 'Too many requests — slow down and retry.'),
    );
  },
  // Limiting in tests makes suites order-dependent and flaky.
  skip: () => isTest,
};

/** Applied to the entire API surface. */
export const globalRateLimit = rateLimit({
  ...shared,
  limit: env.RATE_LIMIT_MAX,
});

/** Applied on top of the global limit for money and credential endpoints. */
export const sensitiveRateLimit = rateLimit({
  ...shared,
  limit: env.RATE_LIMIT_SENSITIVE_MAX,
});
