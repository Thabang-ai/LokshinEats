/**
 * Delivery OTP generation and verification.
 *
 * The customer reads a short code to the driver on handover, and the driver
 * submits it to close the order. Three properties matter:
 *
 *   1. The code is unguessable. The web app generated it with `Math.random`,
 *      which is seeded predictably and is not a CSPRNG. This uses
 *      `crypto.randomInt`, which draws from the OS entropy pool and rejects
 *      biased samples rather than taking a modulo.
 *   2. The driver cannot read it. Only a salted scrypt hash is persisted, and
 *      order serialisers strip the hash from every response. Previously the
 *      plaintext sat on the order document the assigned driver could read, so
 *      a driver could confirm a delivery that never happened.
 *   3. It cannot be brute-forced. Verification is server-side, rate-limited by
 *      an attempt counter on the order, and compares in constant time.
 */

import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

/** Digits in a delivery code. Six keeps a blind guess at 1-in-a-million. */
const OTP_LENGTH = 6;

/** scrypt output length in bytes. */
const KEY_LENGTH = 32;

/** Salt length in bytes. */
const SALT_BYTES = 16;

/** Wrong codes allowed before the order locks and needs support to clear. */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpSecret = {
  /** Plaintext — returned to the customer once, never persisted. */
  code: string;
  /** Persisted on the order; safe to store, useless to an attacker. */
  hash: string;
  /** Persisted alongside the hash. */
  salt: string;
};

/** Random numeric string of OTP_LENGTH digits, uniformly distributed. */
function generateCode(): string {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    // randomInt is rejection-sampled, so every digit is equally likely.
    code += String(randomInt(0, 10));
  }
  return code;
}

function hashCode(code: string, salt: string): Buffer {
  return scryptSync(code, salt, KEY_LENGTH);
}

/** Mint a fresh delivery code plus the material to verify it later. */
export function createDeliveryOtp(): OtpSecret {
  const code = generateCode();
  // 16 random bytes. randomInt cannot be used for this: Node caps its range
  // at 2^48 - 1, and a salt should not be bounded by that anyway.
  const salt = randomBytes(SALT_BYTES).toString('hex');
  return {
    code,
    salt,
    hash: hashCode(code, salt).toString('hex'),
  };
}

/**
 * Constant-time check of a submitted code.
 *
 * Returns false for malformed input rather than throwing, so a caller cannot
 * distinguish "wrong shape" from "wrong code" by the error they get back.
 */
export function verifyDeliveryOtp(
  submitted: string,
  hash: string,
  salt: string,
): boolean {
  if (typeof submitted !== 'string' || !/^\d+$/.test(submitted)) return false;
  if (typeof hash !== 'string' || typeof salt !== 'string') return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const actual = hashCode(submitted, salt);
  return timingSafeEqual(expected, actual);
}
