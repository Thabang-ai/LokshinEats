/**
 * Delivery code tests.
 *
 * The threat is a driver closing an order without ever meeting the customer,
 * so these assert unpredictability and that verification is exact.
 */

import { describe, expect, it } from 'vitest';
import {
  createDeliveryCode,
  verifyDeliveryCode,
  MAX_OTP_ATTEMPTS,
  OTP_LENGTH,
} from './otp';

describe('createDeliveryCode', () => {
  it('produces a six digit numeric code', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(createDeliveryCode()).toMatch(/^\d{6}$/);
    }
  });

  it('spreads codes across the range rather than repeating', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i += 1) codes.add(createDeliveryCode());
    // Collisions in 500 draws from a million values should be rare; a
    // predictable generator would show obvious clustering here.
    expect(codes.size).toBeGreaterThan(490);
  });

  it('uses every digit position, not just a padded small number', () => {
    // Math.floor(1000 + Math.random() * 9000) can never start with 0. A
    // uniform generator must, roughly a tenth of the time.
    const leadingZeros = Array.from({ length: 500 }, createDeliveryCode).filter(
      (code) => code.startsWith('0'),
    );
    expect(leadingZeros.length).toBeGreaterThan(10);
  });
});

describe('verifyDeliveryCode', () => {
  it('accepts the exact code', () => {
    const code = createDeliveryCode();
    expect(verifyDeliveryCode(code, code)).toBe(true);
  });

  it('rejects a wrong code of the same length', () => {
    const code = createDeliveryCode();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(
      OTP_LENGTH,
      '0',
    );
    expect(verifyDeliveryCode(wrong, code)).toBe(false);
  });

  it('rejects a prefix of the correct code', () => {
    expect(verifyDeliveryCode('123', '123456')).toBe(false);
  });

  it('returns false rather than throwing on malformed input', () => {
    // A caller must not be able to tell "malformed" from "wrong" by whether
    // they get an error back.
    expect(verifyDeliveryCode('', '123456')).toBe(false);
    expect(verifyDeliveryCode('123456', '')).toBe(false);
    expect(verifyDeliveryCode(null, '123456')).toBe(false);
    expect(verifyDeliveryCode(undefined, '123456')).toBe(false);
    expect(verifyDeliveryCode(123456 as unknown as string, '123456')).toBe(false);
    expect(verifyDeliveryCode('123456', null)).toBe(false);
  });
});

describe('MAX_OTP_ATTEMPTS', () => {
  it('leaves brute force impractical', () => {
    // Six digits with a handful of attempts keeps the chance of guessing a
    // delivery code well under one in a hundred thousand.
    expect(MAX_OTP_ATTEMPTS / 10 ** OTP_LENGTH).toBeLessThan(0.00001);
  });
});
