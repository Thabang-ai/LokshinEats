/**
 * Things that only go wrong in production.
 *
 * The emulator serves any query without a composite index and never checks
 * credentials, so a missing index or an unset key passes every other test in
 * this suite and fails for the first real customer. These tests are the only
 * place that catches them before a deploy does.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { productionProblems } from './env';

type IndexField = { fieldPath: string; order?: string };
type Index = { collectionGroup: string; fields: IndexField[] };

const indexes: Index[] = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'firebase', 'firestore.indexes.json'),
    'utf8',
  ),
).indexes;

function declared(group: string, ...fields: string[]): boolean {
  const wanted = fields.map((f) => {
    const [fieldPath, dir] = f.split(' ');
    return {
      fieldPath,
      order: dir === 'desc' ? 'DESCENDING' : 'ASCENDING',
    };
  });
  return indexes.some(
    (index) =>
      index.collectionGroup === group &&
      index.fields.length === wanted.length &&
      index.fields.every(
        (field, i) =>
          field.fieldPath === wanted[i]!.fieldPath &&
          field.order === wanted[i]!.order,
      ),
  );
}

describe('composite indexes the API needs in production', () => {
  // One line per query shape the repositories issue. Adding a filter or an
  // orderBy to a repository query means adding its index here and to
  // firebase/firestore.indexes.json - the emulator will not tell you.
  const required: Array<[string, ...string[]]> = [
    // orders: each audience's list, optionally by status, newest first
    ['orders', 'customerId', 'createdAt desc'],
    ['orders', 'customerId', 'status', 'createdAt desc'],
    ['orders', 'storeId', 'createdAt desc'],
    ['orders', 'storeId', 'status', 'createdAt desc'],
    ['orders', 'driverId', 'createdAt desc'],
    ['orders', 'driverId', 'status', 'createdAt desc'],
    ['orders', 'status', 'createdAt desc'],
    // payments
    ['payments', 'orderId', 'createdAt desc'],
    ['payments', 'customerId', 'createdAt desc'],
    ['payments', 'customerId', 'status', 'createdAt desc'],
    ['payments', 'status', 'createdAt desc'],
    // users, filtered by role on the People page
    ['users', 'role', 'createdAt desc'],
    // wallet ledgers and the notification inbox
    ['walletTransactions', 'walletId', 'createdAt desc'],
    ['notifications', 'userId', 'createdAt desc'],
    // the store browser's filters, alphabetical
    ['stores', 'city', 'name'],
    ['stores', 'cuisine', 'name'],
    ['stores', 'isOpen', 'name'],
    ['stores', 'city', 'isOpen', 'name'],
    ['stores', 'cuisine', 'isOpen', 'name'],
    ['stores', 'city', 'cuisine', 'name'],
    ['stores', 'city', 'cuisine', 'isOpen', 'name'],
    // menus
    ['products', 'storeId', 'name'],
    ['products', 'storeId', 'available', 'name'],
    ['products', 'storeId', 'category', 'name'],
    ['products', 'storeId', 'category', 'available', 'name'],
  ];

  it.each(required)('%s: %s', (group, ...fields) => {
    expect(declared(group, ...fields)).toBe(true);
  });
});

describe('production refuses to start on settings that fail silently', () => {
  const production = {
    NODE_ENV: 'production',
    CORS_ORIGINS: ['https://lokshineats.vercel.app'],
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
    usingEmulator: false,
  };

  it('a complete production configuration is accepted', () => {
    expect(productionProblems(production)).toEqual([]);
  });

  it('an empty CORS list, which would refuse every browser', () => {
    const problems = productionProblems({ ...production, CORS_ORIGINS: [] });
    expect(problems.join(' ')).toMatch(/CORS_ORIGINS is empty/);
  });

  it('no Firebase credentials, which would only fail on the first order', () => {
    const problems = productionProblems({
      ...production,
      FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
    });
    expect(problems.join(' ')).toMatch(/FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it('a key file path is an acceptable alternative', () => {
    expect(
      productionProblems({
        ...production,
        FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
        GOOGLE_APPLICATION_CREDENTIALS: '/secrets/key.json',
      }),
    ).toEqual([]);
  });

  it('development is left alone', () => {
    expect(
      productionProblems({
        NODE_ENV: 'development',
        CORS_ORIGINS: [],
        usingEmulator: false,
      }),
    ).toEqual([]);
  });
});
