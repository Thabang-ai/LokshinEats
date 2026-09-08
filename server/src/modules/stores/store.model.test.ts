/**
 * Store schema tests.
 *
 * These assert the boundary rather than the happy path: the fields a vendor
 * must never be able to set are the ones that decide who owns a store and how
 * good it looks to customers.
 */

import { describe, expect, it } from 'vitest';
import { createStoreSchema, updateStoreSchema, toStore } from './store.model';

const validStore = {
  name: 'Kasi Kota Corner',
  cuisine: 'Kota Specialist',
  address: '12 Vilakazi Street',
  city: 'Soweto',
};

describe('createStoreSchema', () => {
  it('accepts a minimal registration and applies sensible defaults', () => {
    const parsed = createStoreSchema.parse(validStore);
    expect(parsed.deliveryFee).toBe(15);
    expect(parsed.minOrderAmount).toBe(30);
    expect(parsed.deliveryTime).toBe('30-45 min');
    expect(parsed.categories).toEqual([]);
  });

  it('refuses to let a vendor claim ownership of a store', () => {
    // ownerId comes from the verified token. Accepting it here would let any
    // caller register a store in someone else's name.
    expect(() =>
      createStoreSchema.parse({ ...validStore, ownerId: 'someone-else' }),
    ).toThrow();
  });

  it('refuses to let a vendor set their own rating', () => {
    // rating and reviewCount are derived from the reviews collection.
    expect(() =>
      createStoreSchema.parse({ ...validStore, rating: 5, reviewCount: 999 }),
    ).toThrow();
  });

  it('refuses an unrealistic or sub-cent delivery fee', () => {
    expect(() =>
      createStoreSchema.parse({ ...validStore, deliveryFee: -5 }),
    ).toThrow();
    expect(() =>
      createStoreSchema.parse({ ...validStore, deliveryFee: 50_000 }),
    ).toThrow();
    expect(() =>
      createStoreSchema.parse({ ...validStore, deliveryFee: 15.999 }),
    ).toThrow();
  });

  it('validates opening hours as 24-hour times', () => {
    expect(() =>
      createStoreSchema.parse({ ...validStore, openingTime: '8am' }),
    ).toThrow();
    expect(
      createStoreSchema.parse({ ...validStore, openingTime: '08:30' })
        .openingTime,
    ).toBe('08:30');
  });
});

describe('updateStoreSchema', () => {
  it('lets a vendor open and close their store', () => {
    expect(updateStoreSchema.parse({ isOpen: true }).isOpen).toBe(true);
  });

  it('still refuses ownership and rating changes', () => {
    expect(() => updateStoreSchema.parse({ ownerId: 'someone-else' })).toThrow();
    expect(() => updateStoreSchema.parse({ rating: 5 })).toThrow();
  });

  it('rejects an empty update rather than writing nothing', () => {
    expect(() => updateStoreSchema.parse({})).toThrow(/at least one field/i);
  });
});

describe('toStore', () => {
  it('fills in safe defaults for a partially written document', () => {
    // Older documents predate several fields; a missing rating must read as
    // 0 rather than NaN, which would break sorting and JSON output.
    const store = toStore({
      id: 'store-1',
      data: () => ({ name: 'Old Store' }),
    } as never);

    expect(store).toMatchObject({
      id: 'store-1',
      name: 'Old Store',
      rating: 0,
      reviewCount: 0,
      isOpen: false,
      categories: [],
      deliveryTime: '30-45 min',
    });
  });

  it('drops non-string entries from categories', () => {
    const store = toStore({
      id: 'store-2',
      data: () => ({ categories: ['Kota', 42, null, 'Braai'] }),
    } as never);

    expect(store.categories).toEqual(['Kota', 'Braai']);
  });
});
