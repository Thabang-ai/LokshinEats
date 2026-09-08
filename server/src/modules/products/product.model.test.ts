/**
 * Product schema tests.
 *
 * Price is the field that matters most: once orders are priced server-side,
 * the product document is the authority on what an item costs, so anything
 * that could corrupt it is a money bug.
 */

import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  updateProductSchema,
  toProduct,
} from './product.model';

const validProduct = {
  name: 'Full House Kota',
  price: 45.5,
  category: 'Kota',
};

describe('createProductSchema', () => {
  it('accepts a minimal product and defaults the rest', () => {
    const parsed = createProductSchema.parse(validProduct);
    expect(parsed.available).toBe(true);
    expect(parsed.preparationTime).toBe(20);
    expect(parsed.isVegetarian).toBe(false);
    expect(parsed.description).toBe('');
  });

  it('refuses to let a vendor choose which store a product belongs to', () => {
    // storeId is derived from the caller's own store. Accepting it would let
    // one vendor add items to a competitor's menu.
    expect(() =>
      createProductSchema.parse({ ...validProduct, storeId: 'other-store' }),
    ).toThrow();
  });

  it('rejects prices that cannot be charged', () => {
    expect(() => createProductSchema.parse({ ...validProduct, price: 0 })).toThrow();
    expect(() => createProductSchema.parse({ ...validProduct, price: -5 })).toThrow();
    // Sub-cent prices would be silently rounded at checkout.
    expect(() =>
      createProductSchema.parse({ ...validProduct, price: 10.999 }),
    ).toThrow(/one cent/i);
    expect(() =>
      createProductSchema.parse({ ...validProduct, price: 99_999 }),
    ).toThrow();
  });

  it('accepts a price at the one-cent boundary', () => {
    expect(createProductSchema.parse({ ...validProduct, price: 0.01 }).price).toBe(
      0.01,
    );
  });

  it('bounds preparation time to something a kitchen could mean', () => {
    expect(() =>
      createProductSchema.parse({ ...validProduct, preparationTime: 0 }),
    ).toThrow();
    expect(() =>
      createProductSchema.parse({ ...validProduct, preparationTime: 10_000 }),
    ).toThrow();
  });
});

describe('updateProductSchema', () => {
  it('allows a price change but still not a store change', () => {
    expect(updateProductSchema.parse({ price: 52 }).price).toBe(52);
    expect(() => updateProductSchema.parse({ storeId: 'other' })).toThrow();
  });

  it('rejects an empty update', () => {
    expect(() => updateProductSchema.parse({})).toThrow(/at least one field/i);
  });
});

describe('toProduct', () => {
  it('treats a missing availability flag as orderable', () => {
    // Products written before the flag existed must not vanish from menus.
    const product = toProduct({
      id: 'p1',
      data: () => ({ name: 'Bunny Chow', price: 60 }),
    } as never);

    expect(product.available).toBe(true);
    expect(product.preparationTime).toBe(20);
  });

  it('normalises a missing price to zero rather than NaN', () => {
    const product = toProduct({ id: 'p2', data: () => ({}) } as never);
    expect(product.price).toBe(0);
    expect(Number.isNaN(product.price)).toBe(false);
  });
});
