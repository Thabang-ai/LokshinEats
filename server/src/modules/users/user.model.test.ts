/**
 * Profile schema and address reading.
 *
 * The address tests exist because the API and the web app disagreed about
 * what an address is: the web profile page writes `{ street, city, postalCode }`
 * while this API modelled it as one string, so every address saved on the web
 * read back through the API as null. These pin the shape both sides now share,
 * and that documents written in the old shape still read.
 */

import { describe, expect, it } from 'vitest';
import {
  createProfileSchema,
  toProfileAddress,
  updateProfileSchema,
} from './user.model';

const address = {
  street: '88 Ndaba Street',
  city: 'Meadowlands',
  postalCode: '1852',
};

describe('toProfileAddress', () => {
  it('reads the structured shape the web profile page writes', () => {
    expect(toProfileAddress(address)).toEqual(address);
  });

  it('trims each part', () => {
    expect(
      toProfileAddress({ street: ' 88 Ndaba Street ', city: 'Meadowlands ', postalCode: ' 1852' }),
    ).toEqual(address);
  });

  it('keeps an old single-line address as the street rather than dropping it', () => {
    expect(toProfileAddress('12 Vilakazi Street, Soweto')).toEqual({
      street: '12 Vilakazi Street, Soweto',
      city: '',
      postalCode: '',
    });
  });

  it('reads nothing, blanks and junk as no address', () => {
    expect(toProfileAddress(undefined)).toBeNull();
    expect(toProfileAddress(null)).toBeNull();
    expect(toProfileAddress('   ')).toBeNull();
    expect(toProfileAddress({ street: '', city: '', postalCode: '' })).toBeNull();
    expect(toProfileAddress(42)).toBeNull();
  });

  it('ignores parts of the wrong type instead of throwing', () => {
    expect(toProfileAddress({ street: '88 Ndaba Street', city: 7, postalCode: null })).toEqual({
      street: '88 Ndaba Street',
      city: '',
      postalCode: '',
    });
  });
});

describe('updateProfileSchema', () => {
  it('accepts a complete address', () => {
    expect(updateProfileSchema.safeParse({ address }).success).toBe(true);
  });

  it('accepts null, which clears a saved address', () => {
    const result = updateProfileSchema.safeParse({ address: null });

    expect(result.success).toBe(true);
    expect(result.success && result.data.address).toBeNull();
  });

  it('rejects an address missing a part', () => {
    const { city: _city, ...partial } = address;

    expect(updateProfileSchema.safeParse({ address: partial }).success).toBe(false);
  });

  it('rejects a postal code that is not four digits', () => {
    for (const postalCode of ['185', '18520', 'abcd']) {
      expect(
        updateProfileSchema.safeParse({ address: { ...address, postalCode } }).success,
        postalCode,
      ).toBe(false);
    }
  });

  it('explains a missing part in words a customer understands', () => {
    const result = updateProfileSchema.safeParse({
      address: { street: '88 Ndaba Street', city: '', postalCode: '1852' },
    });

    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toContain('Enter your town or city.');
    // Not a validator's default wording.
    expect(messages.join(' ')).not.toMatch(/String must contain/);
  });

  it('rejects the old single-string shape', () => {
    // A client still sending a string fails loudly instead of writing a shape
    // the web app cannot read.
    expect(updateProfileSchema.safeParse({ address: '88 Ndaba Street' }).success).toBe(false);
  });

  it('rejects unknown keys inside the address', () => {
    expect(
      updateProfileSchema.safeParse({ address: { ...address, lat: -26.2 } }).success,
    ).toBe(false);
  });
});

describe('createProfileSchema', () => {
  it('accepts a structured address at sign-up', () => {
    expect(
      createProfileSchema.safeParse({ displayName: 'Thabo Nkosi', address }).success,
    ).toBe(true);
  });

  it('rejects a string address at sign-up', () => {
    expect(
      createProfileSchema.safeParse({ displayName: 'Thabo Nkosi', address: '88 Ndaba Street' })
        .success,
    ).toBe(false);
  });
});
