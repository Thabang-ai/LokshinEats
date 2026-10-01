/**
 * Delivery code generation and verification.
 *
 * The customer reads a short code to the driver on handover, and the driver
 * submits it to close the order.
 *
 * The hole this replaces: the web app generated the code with `Math.random`,
 * stored it on the order document that the assigned driver can read, and
 * compared it in the driver's own browser — so a driver could read the code
 * straight out of Firestore and confirm a delivery that never happened. The
 * source even documented this as a known limitation.
 *
 * Three properties fix that:
 *
 *   1. The code is unguessable. `crypto.randomInt` draws from the OS entropy
 *      pool and rejects biased samples rather than taking a modulo.
 *   2. The driver never receives it. `toOrder` serialises orders per audience
 *      and the code is present only for the order's own customer (and admins);
 *      driver and vendor responses omit the field entirely.
 *   3. It cannot be brute-forced. Verification happens here, on the server,
 *      compared in constant time, with a per-order attempt counter.
 *
 * The code is stored in plaintext rather than hashed because the customer has
 * to be able to re-read it: they place the order, and forty minutes later
 * they open the app to read the code to the driver at the door. A one-way
 * hash cannot serve that. At-rest protection therefore rests on Firestore
 * access control — the collection is Admin-SDK-only — rather than on hashing.
 * That is a deliberate trade: the realistic attacker here is the assigned
 * driver, not someone who has already breached the database.
 */

import { randomInt, timingSafeEqual } from 'node:crypto';

/** Digits in a delivery code. Six keeps a blind guess at 1-in-a-million. */
export const OTP_LENGTH = 6;

/** Wrong codes allowed before the order locks and needs support to clear. */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Generate a delivery code.
 *
 * Uniformly distributed: `randomInt` is rejection-sampled, so every digit is
 * equally likely and the result is not predictable from previous codes.
 */
export function createDeliveryCode(): string {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/**
 * Constant-time comparison of a submitted code against the expected one.
 *
 * Returns false for anything malformed rather than throwing, so a caller
 * cannot distinguish "wrong shape" from "wrong code" by the error they get.
 * The comparison itself does not short-circuit on the first differing digit,
 * so response timing reveals nothing about how much of the code was right.
 */
export function verifyDeliveryCode(
  submitted: unknown,
  expected: unknown,
): boolean {
  if (typeof submitted !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (expected.length === 0) return false;
  // Length inequality is safe to short-circuit: the length of a delivery code
  // is a fixed, public constant and leaks nothing about its value.
  if (submitted.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
}
