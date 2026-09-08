/**
 * Distance estimation tests.
 *
 * The figure decides which drivers are shown an order, so the cases that
 * matter are the ones where a wrong answer either hides an order from
 * everyone or puts a cross-city run in front of a bicycle.
 */

import { describe, expect, it } from 'vitest';
import { distanceKm, estimateOrderDistanceKm, geocode } from './geo';

describe('geocode', () => {
  it('matches a known township regardless of case or surrounding text', () => {
    expect(geocode('Soweto')).toEqual(geocode('soweto'));
    expect(geocode('Orlando East, Soweto')).toEqual(geocode('Soweto'));
  });

  it('prefers the more specific suburb over the township containing it', () => {
    // Meadowlands is inside Soweto; matching Soweto first would put every
    // Meadowlands order at the wrong centroid.
    expect(geocode('Meadowlands')).not.toEqual(geocode('Soweto'));
  });

  it('falls back to central Johannesburg for an unknown area', () => {
    const unknown = geocode('Somewhere Nobody Listed');
    expect(unknown.lat).toBeCloseTo(-26.2041, 3);
    expect(unknown.lng).toBeCloseTo(28.0473, 3);
  });

  it('handles an empty string without throwing', () => {
    expect(() => geocode('')).not.toThrow();
    expect(() => geocode('   ')).not.toThrow();
  });
});

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    const point = { lat: -26.2675, lng: 27.8585 };
    expect(distanceKm(point, point)).toBe(0);
  });

  it('is symmetric', () => {
    const soweto = geocode('Soweto');
    const tembisa = geocode('Tembisa');
    expect(distanceKm(soweto, tembisa)).toBe(distanceKm(tembisa, soweto));
  });

  it('puts Soweto to Tembisa in a plausible range for Gauteng', () => {
    // Roughly 45km by road; the straight-line figure should land near it
    // rather than an order of magnitude out.
    const km = distanceKm(geocode('Soweto'), geocode('Tembisa'));
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThan(70);
  });

  it('keeps a nearby suburb short enough for a bicycle', () => {
    const km = distanceKm(geocode('Soweto'), geocode('Meadowlands'));
    expect(km).toBeLessThan(10);
  });
});

describe('estimateOrderDistanceKm', () => {
  it('returns a distance when both sides are known', () => {
    expect(estimateOrderDistanceKm('Soweto', 'Alexandra')).toBeGreaterThan(0);
  });

  it('returns null when either side is missing', () => {
    // Null means "unknown", and callers show the order to every driver rather
    // than hiding it from all of them.
    expect(estimateOrderDistanceKm('', 'Soweto')).toBeNull();
    expect(estimateOrderDistanceKm('Soweto', '')).toBeNull();
    expect(estimateOrderDistanceKm(null, 'Soweto')).toBeNull();
    expect(estimateOrderDistanceKm('Soweto', undefined)).toBeNull();
    expect(estimateOrderDistanceKm('  ', 'Soweto')).toBeNull();
  });

  it('never returns NaN', () => {
    const result = estimateOrderDistanceKm('Nowhere', 'Nowhere Else');
    expect(result).not.toBeNull();
    expect(Number.isNaN(result as number)).toBe(false);
  });
});
