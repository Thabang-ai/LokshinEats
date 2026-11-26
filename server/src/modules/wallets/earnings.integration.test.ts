/**
 * What a driver earned this day, week or month.
 *
 * The apps added this up themselves from a page of the ledger. That is right
 * for a week and quietly short for a month, and a total that stops partway
 * through looks exactly like a total that does not.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createApp } from '../../app';
import { Collections, db } from '../../config/firebase';
import { assertEmulator, resetFirestore, seedUser } from '../../test/support';
import {
  assertAuthEmulator,
  createTestAccount,
  resetAuth,
  type TestAccount,
} from '../../test/auth';
import { sastDay, windowFor } from './earnings.service';

let app: Application;
let driver: TestAccount;

const earnings = (period?: string) =>
  request(app)
    .get(`/api/v1/wallets/me/earnings${period ? `?period=${period}` : ''}`)
    .set(...driver.authHeader);

/** A ledger entry at a given moment, written the way the wallet writes one. */
async function entry(input: {
  type: string;
  amount: number;
  at: Date;
  walletId?: string;
}): Promise<void> {
  await db.collection(Collections.walletTransactions).add({
    walletId: input.walletId ?? 'drv-1',
    type: input.type,
    amount: input.amount,
    balance: 'available',
    description: 'Seeded for a test.',
    orderId: null,
    createdAt: input.at,
  });
}

/** Midday on the day `daysAgo` days back, so no boundary is in question. */
function middayAgo(daysAgo: number): Date {
  const at = new Date();
  at.setUTCHours(10, 0, 0, 0);
  return new Date(at.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

beforeAll(() => {
  assertEmulator();
  assertAuthEmulator();
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([resetFirestore(), resetAuth()]);
  driver = await createTestAccount({ uid: 'drv-1', role: 'driver' });
  await seedUser({ uid: 'drv-1', role: 'driver' });
});

describe('a driver with nothing yet', () => {
  it('earns nothing, and still gets a row for every day', async () => {
    const response = await earnings('week');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      period: 'week',
      earned: 0,
      jobs: 0,
    });
    // A quiet Tuesday is still a Tuesday; a chart with a hole in it reads as
    // a bug.
    expect(response.body.data.byDay).toHaveLength(7);
  });
});

describe('a week of deliveries', () => {
  beforeEach(async () => {
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(0) });
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(0) });
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(3) });
    // Eight days back: inside a month, outside a week.
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(8) });
  });

  it('counts today as a day', async () => {
    const { data } = (await earnings('day')).body;

    expect(data).toMatchObject({ earned: 20, jobs: 2 });
    expect(data.byDay).toHaveLength(1);
  });

  it('counts the last seven days as a week', async () => {
    const { data } = (await earnings('week')).body;

    expect(data).toMatchObject({ earned: 30, jobs: 3 });
  });

  it('and reaches back a month', async () => {
    const { data } = (await earnings('month')).body;

    expect(data).toMatchObject({ earned: 40, jobs: 4 });
    expect(data.byDay).toHaveLength(30);
  });

  it('puts each day in its own row, oldest first', async () => {
    const { data } = (await earnings('week')).body;

    const today = data.byDay[data.byDay.length - 1];
    expect(today).toMatchObject({ date: sastDay(new Date()), jobs: 2, earned: 20 });

    const dates = data.byDay.map((day: { date: string }) => day.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('defaults to the week when nobody says', async () => {
    expect((await earnings()).body.data.period).toBe('week');
  });
});

describe('money that is not pay', () => {
  it('keeps cash taken at the door out of earnings', async () => {
    // A driver holding a customer's R112 has not earned R112. The ledger
    // debits them, because until they hand it over it is somebody else's.
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(0) });
    await entry({ type: 'cash_collected', amount: -112, at: middayAgo(0) });
    await entry({ type: 'cash_handover', amount: 100, at: middayAgo(0) });

    const { data } = (await earnings('day')).body;

    expect(data).toMatchObject({
      earned: 10,
      jobs: 1,
      cashCollected: 112,
      cashHandedOver: 100,
    });
  });

  it('reports goodwill and corrections separately from pay', async () => {
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(0) });
    await entry({ type: 'goodwill', amount: 25, at: middayAgo(0) });
    await entry({ type: 'adjustment', amount: 5, at: middayAgo(0) });

    const { data } = (await earnings('day')).body;

    expect(data).toMatchObject({ earned: 10, extras: 30 });
  });
});

describe('whose earnings they are', () => {
  it("never somebody else's", async () => {
    await entry({ type: 'order_earning', amount: 999, at: middayAgo(0), walletId: 'drv-2' });
    await entry({ type: 'order_earning', amount: 10, at: middayAgo(0) });

    expect((await earnings('day')).body.data.earned).toBe(10);
  });

  it('and not readable signed out', async () => {
    expect(
      (await request(app).get('/api/v1/wallets/me/earnings')).status,
    ).toBe(401);
  });
});

describe('the window itself', () => {
  it('ends at the end of today in Johannesburg', () => {
    // Not "now": a delivery at 23:30 belongs to the day it happened, and a
    // window that stopped at the current minute would drop it the moment
    // somebody refreshed at 23:31 the next day.
    const { to, days } = windowFor('week', new Date('2026-11-26T09:00:00.000Z'));

    expect(days).toBe(7);
    expect(to.toISOString()).toBe('2026-11-26T22:00:00.000Z');
  });
});
