/**
 * Firestore security rules.
 *
 * These are the only tests in the suite that exercise what a *browser* can do.
 * Everything else goes through the API, which uses the Admin SDK and bypasses
 * rules entirely — so a rule could be wide open and every other test would
 * still pass.
 *
 * That gap matters here more than it usually would: the web app has not moved
 * onto the API yet, so `firebase/firestore.rules` is still the only thing
 * standing between a signed-in customer and the money fields on their own
 * order.
 *
 * The suite is in two halves. The first asserts properties that hold. The
 * second, `documented holes`, asserts what the rules currently *allow* and
 * should not — those tests pass today and will fail the moment the rules are
 * tightened, which is the point: they force whoever fixes a hole to come here
 * and flip the assertion rather than quietly leaving a stale test behind.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  setLogLevel,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Roughly half these tests assert that a write is denied, and each denial makes
// the client SDK log a PERMISSION_DENIED error. That is the expected result,
// not a problem, so the noise is silenced to keep real failures visible.
setLogLevel('silent');

let testEnv: RulesTestEnvironment;

const CUSTOMER = 'cust-1';
const OTHER_CUSTOMER = 'cust-2';
const VENDOR = 'vend-1';
const OTHER_VENDOR = 'vend-2';
const DRIVER = 'drv-1';
const ADMIN = 'admin-1';

/** A Firestore handle acting as a signed-in user. */
function as(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

/** A Firestore handle with no credentials at all. */
function anonymous(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

/** Seed data, bypassing rules — the fixtures are not what is under test. */
async function seed(
  write: (db: Firestore) => Promise<unknown>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore() as unknown as Firestore);
  });
}

/** A complete order document, so each test only states what it changes. */
function orderDoc(overrides: Record<string, unknown> = {}) {
  return {
    customerId: CUSTOMER,
    storeId: 'store-1',
    driverId: null,
    status: 'pending',
    items: [],
    subtotal: 100,
    deliveryFee: 20,
    total: 120,
    paymentMethod: 'yoco',
    paymentStatus: 'pending',
    deliveryOTP: '482913',
    deliveryOTPVerified: false,
    vendorPayout: 92,
    driverPayout: 17,
    platformEarnings: 11,
    platformCommission: 8,
    commissionRate: 0.08,
    driverDeliveryShare: 0.85,
    ...overrides,
  };
}

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    throw new Error(
      'Rules tests need the Firestore emulator. Use `npm run test:integration`.',
    );
  }

  const [hostname, port] = host.split(':');

  testEnv = await initializeTestEnvironment({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'lokshineats-test',
    firestore: {
      rules: readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'firebase', 'firestore.rules'),
        'utf8',
      ),
      host: hostname,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Role documents, which several rules read back via get().
  await seed(async (db) => {
    await setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' });
    await setDoc(doc(db, 'users', OTHER_CUSTOMER), { role: 'customer' });
    await setDoc(doc(db, 'users', VENDOR), { role: 'vendor' });
    await setDoc(doc(db, 'users', OTHER_VENDOR), { role: 'vendor' });
    await setDoc(doc(db, 'users', DRIVER), { role: 'driver' });
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin' });
    await setDoc(doc(db, 'stores', 'store-1'), { ownerId: VENDOR });
    await setDoc(doc(db, 'stores', 'store-2'), { ownerId: OTHER_VENDOR });
  });
});

/**
 * The collections the API owns.
 *
 * None of them appear in the rules file, and with rules_version 2 anything
 * unmatched is denied. That default is doing real work: it is the reason a
 * browser cannot read a wallet balance or forge a payment record, even though
 * nobody wrote a rule saying so.
 */
describe('collections the API owns are closed to clients', () => {
  const closed = ['wallets', 'walletTransactions', 'payments', 'sandboxPayments'];

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'wallets', VENDOR), {
        ownerId: VENDOR,
        availableBalance: 500,
        pendingBalance: 92,
      });
      await setDoc(doc(db, 'walletTransactions', 'txn-1'), {
        walletId: VENDOR,
        amount: 92,
      });
      await setDoc(doc(db, 'payments', 'pay-1'), {
        orderId: 'order-1',
        customerId: CUSTOMER,
        amount: 120,
      });
      await setDoc(doc(db, 'sandboxPayments', 'sbx-1'), {
        orderId: 'order-1',
        status: 'pending',
      });
    });
  });

  for (const collection of closed) {
    it(`denies an anonymous read of ${collection}`, async () => {
      const db = anonymous();
      await assertFails(getDoc(doc(db, collection, 'anything')));
    });

    it(`denies a signed-in read of ${collection}`, async () => {
      const db = as(CUSTOMER);
      await assertFails(getDoc(doc(db, collection, 'anything')));
    });

    it(`denies a signed-in write to ${collection}`, async () => {
      const db = as(CUSTOMER);
      await assertFails(setDoc(doc(db, collection, 'forged'), { amount: 1_000_000 }));
    });
  }

  it('denies even an admin — these are Admin SDK only', async () => {
    // Admin privileges in these rules are about the operator console, not
    // about money. The API is the only writer of a wallet.
    const db = as(ADMIN);
    await assertFails(getDoc(doc(db, 'wallets', VENDOR)));
    await assertFails(
      updateDoc(doc(db, 'wallets', VENDOR), { availableBalance: 999_999 }),
    );
  });

  it('denies a vendor reading their own wallet directly', async () => {
    const db = as(VENDOR);
    await assertFails(getDoc(doc(db, 'wallets', VENDOR)));
  });
});

describe('users', () => {
  it('lets a user read their own profile', async () => {
    const db = as(CUSTOMER);
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER)));
  });

  it('stops a user reading someone else’s profile', async () => {
    const db = as(CUSTOMER);
    await assertFails(getDoc(doc(db, 'users', OTHER_CUSTOMER)));
  });

  it('lets an admin read any profile', async () => {
    const db = as(ADMIN);
    await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER)));
  });

  it('stops a user writing to someone else’s profile', async () => {
    const db = as(CUSTOMER);
    await assertFails(
      updateDoc(doc(db, 'users', OTHER_CUSTOMER), { displayName: 'Hijacked' }),
    );
  });

  it('denies an anonymous read', async () => {
    const db = anonymous();
    await assertFails(getDoc(doc(db, 'users', CUSTOMER)));
  });
});

describe('stores', () => {
  it('lets anyone browse without signing in', async () => {
    const db = anonymous();
    await assertSucceeds(getDoc(doc(db, 'stores', 'store-1')));
  });

  it('lets a user create a store they will own', async () => {
    const db = as(CUSTOMER);
    await assertSucceeds(
      setDoc(doc(db, 'stores', 'new-store'), { ownerId: CUSTOMER, name: 'Mine' }),
    );
  });

  it('stops a user creating a store owned by someone else', async () => {
    const db = as(CUSTOMER);
    await assertFails(
      setDoc(doc(db, 'stores', 'new-store'), { ownerId: VENDOR, name: 'Theirs' }),
    );
  });

  it('lets the owner edit their store', async () => {
    const db = as(VENDOR);
    await assertSucceeds(
      updateDoc(doc(db, 'stores', 'store-1'), { name: 'Renamed' }),
    );
  });

  it('stops another vendor editing it', async () => {
    const db = as(OTHER_VENDOR);
    await assertFails(
      updateDoc(doc(db, 'stores', 'store-1'), { name: 'Hijacked' }),
    );
  });

  it('stops another vendor deleting it', async () => {
    const db = as(OTHER_VENDOR);
    await assertFails(deleteDoc(doc(db, 'stores', 'store-1')));
  });

  it('rejects a rating outside the allowed range', async () => {
    const db = as(CUSTOMER);
    await assertFails(
      updateDoc(doc(db, 'stores', 'store-1'), { rating: 9, reviewCount: 1 }),
    );
  });

  it('rejects smuggling another field alongside a rating update', async () => {
    // The aggregate exception is bounded to exactly two fields.
    const db = as(CUSTOMER);
    await assertFails(
      updateDoc(doc(db, 'stores', 'store-1'), {
        rating: 5,
        reviewCount: 1,
        ownerId: CUSTOMER,
      }),
    );
  });
});

describe('products', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'products', 'prod-1'), {
        storeId: 'store-1',
        name: 'Kota',
        price: 45.5,
      });
    });
  });

  it('lets anyone read a menu without signing in', async () => {
    const db = anonymous();
    await assertSucceeds(getDoc(doc(db, 'products', 'prod-1')));
  });

  it('lets a vendor add an item to their own store', async () => {
    const db = as(VENDOR);
    await assertSucceeds(
      setDoc(doc(db, 'products', 'prod-2'), { storeId: 'store-1', price: 30 }),
    );
  });

  it('stops a vendor adding an item to another store', async () => {
    const db = as(OTHER_VENDOR);
    await assertFails(
      setDoc(doc(db, 'products', 'prod-3'), { storeId: 'store-1', price: 30 }),
    );
  });

  it('stops a customer adding a menu item', async () => {
    const db = as(CUSTOMER);
    await assertFails(
      setDoc(doc(db, 'products', 'prod-4'), { storeId: 'store-1', price: 0.01 }),
    );
  });
});

describe('orders', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'orders', 'order-1'), orderDoc());
      await setDoc(
        doc(db, 'orders', 'order-ready'),
        orderDoc({ status: 'ready', driverId: null }),
      );
      await setDoc(
        doc(db, 'orders', 'order-mine'),
        orderDoc({ driverId: DRIVER, status: 'picked_up' }),
      );
    });
  });

  it('lets the customer read their own order', async () => {
    const db = as(CUSTOMER);
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-1')));
  });

  it('stops an unrelated customer reading it', async () => {
    const db = as(OTHER_CUSTOMER);
    await assertFails(getDoc(doc(db, 'orders', 'order-1')));
  });

  it('lets the store owner read it', async () => {
    const db = as(VENDOR);
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-1')));
  });

  it('stops another vendor reading it', async () => {
    const db = as(OTHER_VENDOR);
    await assertFails(getDoc(doc(db, 'orders', 'order-1')));
  });

  it('denies an anonymous read', async () => {
    const db = anonymous();
    await assertFails(getDoc(doc(db, 'orders', 'order-1')));
  });

  it('stops a customer forging an order in someone else’s name', async () => {
    const db = as(CUSTOMER);
    await assertFails(
      setDoc(doc(db, 'orders', 'forged'), orderDoc({ customerId: OTHER_CUSTOMER })),
    );
  });

  it('stops a non-admin deleting an order', async () => {
    const db = as(CUSTOMER);
    await assertFails(deleteDoc(doc(db, 'orders', 'order-1')));
  });

  it('lets an admin delete an order', async () => {
    const db = as(ADMIN);
    await assertSucceeds(deleteDoc(doc(db, 'orders', 'order-1')));
  });

  it('stops an admin rewriting money fields through the reset branch', async () => {
    // isAdminOrderReset() restricts the admin branch to operational keys.
    const db = as(ADMIN);
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-1'), { total: 1, vendorPayout: 0 }),
    );
  });
});

/**
 * Everything below asserts behaviour the rules currently ALLOW and should not.
 *
 * These pass today. When a rule is tightened, the matching test starts
 * failing — that is deliberate, and the failure is the signal to move the
 * assertion from `assertSucceeds` to `assertFails` and delete this note.
 *
 * None of these are reachable through the API, which validates every one of
 * them. They are reachable from the browser, because the web app still writes
 * to Firestore directly.
 */
describe('documented holes — current rules allow these', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'orders', 'order-1'), orderDoc());
      await setDoc(
        doc(db, 'orders', 'order-mine'),
        orderDoc({ driverId: DRIVER, status: 'picked_up' }),
      );
      await setDoc(
        doc(db, 'orders', 'order-ready'),
        orderDoc({ status: 'ready', driverId: null }),
      );
      await setDoc(doc(db, 'products', 'prod-1'), {
        storeId: 'store-1',
        name: 'Kota',
        price: 45.5,
      });
    });
  });

  it('HOLE: any signed-in user can grant themselves the admin role', async () => {
    // `users` allows a user to write their own document with no field
    // restriction, and isAdmin() reads the role straight back out of it. So
    // this single write makes the caller an admin for every other rule —
    // including order deletion and reading every user profile.
    const db = as(CUSTOMER);
    await assertSucceeds(setDoc(doc(db, 'users', CUSTOMER), { role: 'admin' }));

    // Proof the escalation is real, not just a permitted write.
    await assertSucceeds(getDoc(doc(db, 'users', OTHER_CUSTOMER)));
  });

  it('HOLE: a customer can create an order with payouts they invented', async () => {
    // Order creation checks only that customerId matches the caller. Every
    // money field is whatever the browser sent.
    const db = as(CUSTOMER);
    await assertSucceeds(
      setDoc(
        doc(db, 'orders', 'forged-cheap'),
        orderDoc({
          total: 1,
          subtotal: 1,
          vendorPayout: 0,
          driverPayout: 0,
          platformEarnings: 1,
          paymentStatus: 'paid',
        }),
      ),
    );
  });

  it('HOLE: a customer can mark their own order paid after the fact', async () => {
    // The rules comment claims the frozen financial fields "can never be
    // touched by anyone after checkout". That is true only of the admin
    // branch; the customer branch has no field restriction at all.
    const db = as(CUSTOMER);
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'order-1'), { paymentStatus: 'paid' }),
    );
  });

  it('HOLE: a customer can rewrite the payouts on their own order', async () => {
    const db = as(CUSTOMER);
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'order-1'), {
        total: 1,
        vendorPayout: 0,
        driverPayout: 0,
        platformEarnings: 1,
      }),
    );
  });

  it('HOLE: the assigned driver can read the delivery code', async () => {
    // The whole reason delivery confirmation moved server-side.
    const db = as(DRIVER);
    const snapshot = await getDoc(doc(db, 'orders', 'order-mine'));
    expect(snapshot.data()?.deliveryOTP).toBe('482913');
  });

  it('HOLE: any driver can read the delivery code of an unclaimed order', async () => {
    // Browsing available deliveries returns the whole document, code included,
    // before the driver has any relationship to the order at all.
    const db = as(DRIVER);
    const snapshot = await getDoc(doc(db, 'orders', 'order-ready'));
    expect(snapshot.data()?.deliveryOTP).toBe('482913');
  });

  it('HOLE: the assigned driver can self-confirm a delivery', async () => {
    // Combined with the previous two, a driver can mark a delivery complete
    // without ever meeting the customer.
    const db = as(DRIVER);
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'order-mine'), {
        deliveryOTPVerified: true,
        status: 'delivered',
      }),
    );
  });

  it('HOLE: a vendor can move another vendor’s product into their own store', async () => {
    // The product rule checks the *incoming* storeId, never the existing one,
    // so rewriting storeId to a store you own passes.
    const db = as(OTHER_VENDOR);
    await assertSucceeds(
      updateDoc(doc(db, 'products', 'prod-1'), { storeId: 'store-2' }),
    );
  });

  it('BUG: a vendor cannot delete their own product', async () => {
    // Not a security hole — the opposite. `allow write` covers delete, but on
    // a delete `request.resource` is null, so evaluating
    // request.resource.data.storeId errors and the rule denies everyone.
    // Menu deletion from the browser cannot work at all.
    const db = as(VENDOR);
    await assertFails(deleteDoc(doc(db, 'products', 'prod-1')));
  });
});
