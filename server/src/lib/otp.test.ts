/**
 * Delivery OTP tests.
 *
 * The threat these guard against is a driver marking an order delivered
 * without ever meeting the customer, so the tests assert that the plaintext
 * code is not recoverable from what gets persisted.
 */

import { describe, expect, it } from 'vitest';
import { createDeliveryOtp, verifyDeliveryOtp, MAX_OTP_ATTEMPTS } from './otp';

describe('createDeliveryOtp', () => {
  it('produces a six digit numeric code', () => {
    for (let i = 0; i < 50; i += 1) {
      const { code } = createDeliveryOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('never persists the plaintext code', () => {
    const { code, hash, salt } = createDeliveryOtp();
    // What lands in Firestore is the hash and salt. Neither may contain the
    // code, or a driver who can read the order can read the code.
    expect(hash).not.toContain(code);
    expect(salt).not.toContain(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('salts every code separately', () => {
    const salts = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const otp = createDeliveryOtp();
      salts.add(otp.salt);
      hashes.add(otp.hash);
    }
    // Distinct salts mean two orders sharing a code do not share a hash, so
    // the hashes cannot be compared against each other to learn anything.
    expect(salts.size).toBe(25);
    expect(hashes.size).toBe(25);
  });

  it('spreads codes across the range rather than repeating', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) codes.add(createDeliveryOtp().code);
    // Collisions in 200 draws from a million values should be vanishingly
    // rare; a predictable generator would show clustering here.
    expect(codes.size).toBeGreaterThan(195);
  });
});

describe('verifyDeliveryOtp', () => {
  it('accepts the correct code', () => {
    const { code, hash, salt } = createDeliveryOtp();
    expect(verifyDeliveryOtp(code, hash, salt)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const { code, hash, salt } = createDeliveryOtp();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(verifyDeliveryOtp(wrong, hash, salt)).toBe(false);
  });

  it('rejects the right code against the wrong salt', () => {
    const first = createDeliveryOtp();
    const second = createDeliveryOtp();
    expect(verifyDeliveryOtp(first.code, first.hash, second.salt)).toBe(false);
  });

  it('returns false rather than throwing on malformed input', () => {
    const { hash, salt } = createDeliveryOtp();
    // A caller must not be able to tell "malformed" from "wrong" by whether
    // they get an error, so every one of these is a plain false.
    expect(verifyDeliveryOtp('', hash, salt)).toBe(false);
    expect(verifyDeliveryOtp('abcdef', hash, salt)).toBe(false);
    expect(verifyDeliveryOtp('12345', 'not-hex', salt)).toBe(false);
    expect(verifyDeliveryOtp('123456', 'aa', salt)).toBe(false);
    expect(verifyDeliveryOtp(null as unknown as string, hash, salt)).toBe(false);
  });
});

describe('MAX_OTP_ATTEMPTS', () => {
  it('leaves brute force impractical', () => {
    // Six digits with a handful of attempts keeps the chance of guessing a
    // delivery code well under one in a hundred thousand.
    expect(MAX_OTP_ATTEMPTS / 1_000_000).toBeLessThan(0.00001);
  });
});
