/**
 * What somebody earned over a day, a week or a month.
 *
 * The apps worked this out themselves: the earnings screen read a page of
 * the ledger, paged back seven days, and added up whatever it had. That is
 * right for a week and quietly wrong for a month - a driver with a busy
 * month gets a page of entries and a total that stops partway through,
 * presented as the month's earnings. Nobody can tell by looking.
 *
 * Summed here instead, over the whole period, in cents, and broken down by
 * day so a screen can draw the week without asking again.
 *
 * Days are South African calendar days, like every other report: a day that
 * starts at 02:00 loses two hours of work every day and never says so.
 */

import { ApiError } from '../../lib/ApiError';
import { sumRands } from '../../lib/money';
import type { LedgerEntry } from './wallet.model';
import * as repository from './wallet.repository';

export const EARNINGS_PERIODS = ['day', 'week', 'month'] as const;
export type EarningsPeriod = (typeof EARNINGS_PERIODS)[number];

export type DayEarnings = {
  /** YYYY-MM-DD in South Africa. */
  date: string;
  /** Deliveries for a driver; orders for a kitchen. */
  jobs: number;
  earned: number;
};

export type EarningsSummary = {
  period: EarningsPeriod;
  /** The window summed, as instants, so a screen can label it exactly. */
  from: string;
  to: string;
  /** Pay for work done: delivery pay for a driver, order payouts for a kitchen. */
  earned: number;
  /** How many jobs that pay came from. */
  jobs: number;
  /** Anything LokshinEats added: goodwill, bonuses, corrections. */
  extras: number;
  /** Cash taken at the door that is not theirs, where that applies. */
  cashCollected: number;
  /** How much of it has reached the kitchen. */
  cashHandedOver: number;
  /** Oldest day first, one entry per day of the period, zeroes included. */
  byDay: DayEarnings[];
};

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The South African calendar day an instant falls in. */
export function sastDay(at: Date): string {
  return new Date(at.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight in Johannesburg, as a UTC instant. */
function sastMidnight(date: string): Date {
  const midnight = new Date(`${date}T00:00:00.000Z`);
  midnight.setUTCHours(midnight.getUTCHours() - 2);
  return midnight;
}

/**
 * The window a period covers, ending at the end of today.
 *
 * A week is the last seven days including today, not the calendar week: a
 * driver asking on a Monday morning wants the week they have just worked,
 * not the five hours since Sunday midnight.
 */
export function windowFor(
  period: EarningsPeriod,
  now: Date = new Date(),
): { from: Date; to: Date; days: number } {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const to = new Date(sastMidnight(sastDay(now)).getTime() + DAY_MS);
  const from = new Date(to.getTime() - days * DAY_MS);

  return { from, to, days };
}

/** The size of one kind of entry, whichever way round the ledger holds it. */
function sumAbsolute(entries: LedgerEntry[], type: LedgerEntry['type']): number {
  return sumRands(
    entries
      .filter((entry) => entry.type === type)
      .map((entry) => Math.abs(entry.amount)),
  );
}

/** Pay for work done, as opposed to money moved about. */
function isPay(entry: LedgerEntry): boolean {
  return entry.type === 'order_earning';
}

export async function summarise(
  walletId: string,
  period: EarningsPeriod,
  now: Date = new Date(),
): Promise<EarningsSummary> {
  if (!(EARNINGS_PERIODS as readonly string[]).includes(period)) {
    throw ApiError.badRequest('Ask for a day, a week or a month.');
  }

  const { from, to, days } = windowFor(period, now);
  const entries = await repository.listEntriesBetween(walletId, from, to);

  const pay = entries.filter(isPay);

  // One row per day whether anything happened or not: a week with a quiet
  // Tuesday has a Tuesday in it, and a chart with a hole where a day should
  // be reads as a bug.
  const byDay: DayEarnings[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const dayStart = new Date(to.getTime() - (index + 1) * DAY_MS);
    const date = sastDay(new Date(dayStart.getTime() + 1));
    const ofDay = pay.filter(
      (entry) => entry.createdAt !== null && sastDay(new Date(entry.createdAt)) === date,
    );

    byDay.push({
      date,
      jobs: ofDay.length,
      earned: sumRands(ofDay.map((entry) => entry.amount)),
    });
  }

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    earned: sumRands(pay.map((entry) => entry.amount)),
    jobs: pay.length,
    extras: sumRands(
      entries
        .filter(
          (entry) =>
            entry.type === 'goodwill' ||
            entry.type === 'bonus' ||
            entry.type === 'adjustment',
        )
        .map((entry) => entry.amount),
    ),
    // Both are negative on the ledger, because holding somebody else's money
    // is a debt and handing it on settles one. Reported as the positive
    // amounts that actually changed hands, and summed as positives:
    // `sumRands` refuses a negative, deliberately, since a negative price is
    // always a bug somewhere.
    cashCollected: sumAbsolute(entries, 'cash_collected'),
    cashHandedOver: sumAbsolute(entries, 'cash_handover'),
    byDay,
  };
}
