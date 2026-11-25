/**
 * Where a kitchen will send a driver.
 *
 * The rule has to survive how people actually type an address. A customer
 * writing "meadowlands " must not be turned away by a kitchen that wrote
 * "Meadowlands", and a kitchen that lists areas and forgets its own township
 * has forgotten rather than decided.
 */

import { describe, expect, it } from 'vitest';
import {
  areaKey,
  deliversTo,
  listAreas,
  withOwnCity,
} from './store.model';

describe('matching an area to what somebody typed', () => {
  it('ignores case and stray spacing', () => {
    expect(areaKey('  Meadowlands ')).toBe('meadowlands');
    expect(areaKey('Meadow   Lands')).toBe('meadow lands');
  });

  it('keeps two different areas different', () => {
    expect(areaKey('Meadowlands')).not.toBe(areaKey('Dobsonville'));
  });
});

describe('a kitchen that has not said where it delivers', () => {
  it('delivers anywhere', () => {
    // Every kitchen on the platform, the morning this deploys.
    expect(deliversTo({ deliveryAreas: [] }, 'Tembisa')).toBe(true);
  });
});

describe('a kitchen that has said where it delivers', () => {
  const store = { deliveryAreas: ['Meadowlands', 'Dobsonville'] };

  it('delivers to an area on its list', () => {
    expect(deliversTo(store, 'Dobsonville')).toBe(true);
  });

  it('however the customer typed it', () => {
    expect(deliversTo(store, '  dobsonville ')).toBe(true);
  });

  it('and not to one that is missing from it', () => {
    expect(deliversTo(store, 'Tembisa')).toBe(false);
  });

  it('with no partial matches', () => {
    // "Dobson" is not Dobsonville, and neither is "Dobsonville Ext 2". The
    // second is a real address a customer will type, and refusing it is
    // better than a kitchen silently taking on a run it did not agree to.
    expect(deliversTo(store, 'Dobson')).toBe(false);
    expect(deliversTo(store, 'Dobsonville Ext 2')).toBe(false);
  });
});

describe('the ground the kitchen stands on', () => {
  it('is on the list whether the vendor remembered it or not', () => {
    expect(withOwnCity(['Dobsonville'], 'Meadowlands')).toEqual([
      'Meadowlands',
      'Dobsonville',
    ]);
  });

  it('is not added twice when they did remember', () => {
    expect(withOwnCity(['meadowlands', 'Dobsonville'], 'Meadowlands')).toEqual([
      'meadowlands',
      'Dobsonville',
    ]);
  });

  it('does not turn an empty list into a one-area kitchen', () => {
    // An empty list means no limit. Folding the city in here would quietly
    // confine every kitchen on the platform to its own township.
    expect(withOwnCity([], 'Meadowlands')).toEqual([]);
  });

  it('survives a kitchen with no city on it', () => {
    expect(withOwnCity(['Soweto'], '')).toEqual(['Soweto']);
  });
});

describe('telling somebody where a kitchen does deliver', () => {
  it('reads like a sentence', () => {
    expect(listAreas(['Meadowlands', 'Dobsonville', 'Soweto'])).toBe(
      'Meadowlands, Dobsonville and Soweto',
    );
    expect(listAreas(['Meadowlands', 'Soweto'])).toBe('Meadowlands and Soweto');
    expect(listAreas(['Meadowlands'])).toBe('Meadowlands');
  });
});
